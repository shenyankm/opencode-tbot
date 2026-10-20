import { abortable } from "../infra/utils/abort.js";
import { beginBindingSelection } from "./binding-update.js";
import type { ChatSessionBinding } from "../domain/session/session.entity.js";
import type { SessionRepository } from "../domain/session/session.repository.js";
import {
    logPromptLifecycle,
    type AppLogger,
} from "../infra/logger/index.js";
import type {
    OpenCodeAgent,
    PromptSessionFilePartInput,
} from "../services/opencode/opencode.client.js";
import type { OpenCodePromptGateway } from "../services/opencode/opencode.ports.js";
import { resolveSelectedAgent } from "./agent-selection.js";
import {
    clearStoredAgentSelection,
    clearStoredModelSelection,
    clearStoredModelVariant,
    clearStoredSessionContext,
} from "./binding-update.js";
import { createAndBindCurrentProjectSession } from "./session-creation.js";
import { hasMatchingProject } from "./project-binding.js";

export type ActiveChatBinding = ChatSessionBinding & {
    directory: string;
    projectId: string;
    sessionId: string;
};

export interface ResolvedPromptContext {
    activeBinding: ActiveChatBinding;
    model: {
        providerID: string;
        modelID: string;
    } | null;
    promptText: string;
    selectedAgent: OpenCodeAgent | null;
    shouldIsolateImageTurn: boolean;
}

export interface ResolvePromptContextInput {
    chatId: number;
    files: PromptSessionFilePartInput[];
    signal?: AbortSignal;
    text?: string | null;
}

export class PromptContextResolver {
    constructor(
        private readonly sessionRepo: SessionRepository,
        private readonly opencodeClient: OpenCodePromptGateway,
        private readonly logger: AppLogger,
    ) { }

    async resolve(input: ResolvePromptContextInput): Promise<ResolvedPromptContext> {
        input.signal?.throwIfAborted();
        const assertCurrent = beginBindingSelection(this.sessionRepo, input.chatId, "session");
        const promptText = buildPromptText(input.text, input.files);

        if (!promptText && input.files.length === 0) {
            throw new Error("Prompt requires text or file attachments.");
        }

        let binding = await abortable(this.sessionRepo.getByChatId(input.chatId), input.signal);
        const session = binding?.sessionId && binding.projectId
            ? await abortable(this.opencodeClient.getSession(binding.sessionId, input.signal), input.signal)
            : null;

        if (binding?.projectId && binding.directory) {
            const projects = await abortable(this.opencodeClient.listProjects(input.signal), input.signal);
            if (!(await abortable(hasMatchingProject(projects, binding, this.opencodeClient, session ? [session] : []), input.signal))) {
                input.signal?.throwIfAborted();
                assertCurrent();
                binding = await this.clearInvalidSessionContext(
                    input.chatId,
                    binding,
                    "saved project is no longer available",
                    input.signal,
                );
            }
        }

        if (binding?.sessionId && binding.projectId) {
            if (!session || session.id !== binding.sessionId || session.projectID !== binding.projectId) {
                input.signal?.throwIfAborted();
                assertCurrent();
                binding = await this.clearInvalidSessionContext(
                    input.chatId,
                    binding,
                    "saved session is no longer available",
                    input.signal,
                );
            }
        }

        if (!binding || !binding.sessionId || !binding.projectId || !binding.directory) {
            const createdSession = await createAndBindCurrentProjectSession(
                this.sessionRepo,
                this.opencodeClient,
                {
                    chatId: input.chatId,
                    signal: input.signal,
                    assertCurrent,
                },
            );
            binding = createdSession.binding;
            logPromptLifecycle(
                this.logger,
                {
                    chatId: input.chatId,
                    event: "prompt.session.created",
                    projectId: createdSession.session.projectID,
                    sessionId: createdSession.session.id,
                    directory: createdSession.session.directory,
                },
                "session created",
            );
        }

        if (binding?.modelProviderId && binding?.modelId) {
            const availableModels = await abortable(this.opencodeClient.listModels(input.signal), input.signal);
            const selectedModel = availableModels.find((model) =>
                model.providerID === binding?.modelProviderId && model.id === binding?.modelId,
            );

            if (!selectedModel) {
                input.signal?.throwIfAborted();
                binding = await clearStoredModelSelection(this.sessionRepo, binding, input.signal);
                this.logger.warn?.(
                    {
                        chatId: input.chatId,
                        event: "prompt.model.unavailable",
                    },
                    "selected model is no longer available, falling back to OpenCode default",
                );
            } else if (binding.modelVariant && !(binding.modelVariant in selectedModel.variants)) {
                input.signal?.throwIfAborted();
                binding = await clearStoredModelVariant(this.sessionRepo, binding, input.signal);
                this.logger.warn?.(
                    {
                        chatId: input.chatId,
                        event: "prompt.model.variant_unavailable",
                        providerId: selectedModel.providerID,
                        modelId: selectedModel.id,
                    },
                    "selected model variant is no longer available, falling back to default variant",
                );
            }
        }

        if (!binding || !binding.sessionId || !binding.projectId || !binding.directory) {
            throw new Error("Failed to initialize chat session.");
        }

        let activeBinding = binding as ActiveChatBinding;
        const availableAgents = await abortable(this.opencodeClient.listAgents(input.signal), input.signal);
        const selectedAgent = resolveSelectedAgent(availableAgents, activeBinding.agentName);

        if (activeBinding.agentName && selectedAgent?.name !== activeBinding.agentName) {
            input.signal?.throwIfAborted();
            activeBinding = await clearStoredAgentSelection(this.sessionRepo, activeBinding, input.signal) as ActiveChatBinding;
            this.logger.warn?.(
                {
                    chatId: input.chatId,
                    event: "prompt.agent.unavailable",
                },
                "selected agent is no longer available, falling back to OpenCode default",
            );
        }

        input.signal?.throwIfAborted();
        assertCurrent();
        return {
            activeBinding,
            model: activeBinding.modelProviderId && activeBinding.modelId
                ? {
                    providerID: activeBinding.modelProviderId,
                    modelID: activeBinding.modelId,
                }
                : null,
            promptText,
            selectedAgent,
            shouldIsolateImageTurn: hasImageFiles(input.files),
        };
    }

    private async clearInvalidSessionContext(
        chatId: number,
        binding: ChatSessionBinding,
        reason: string,
        signal?: AbortSignal,
    ): Promise<ChatSessionBinding> {
        const nextBinding = await clearStoredSessionContext(this.sessionRepo, binding, signal);
        this.logger.warn?.(
            {
                chatId,
                event: "prompt.session.invalid_context",
            },
            `${reason}, falling back to the current OpenCode project`,
        );

        return nextBinding;
    }
}

function buildPromptText(
    text: string | null | undefined,
    files: PromptSessionFilePartInput[],
): string {
    const trimmedText = text?.trim() ?? "";

    if (!files.some(isImageFile)) {
        return trimmedText;
    }

    const promptSections = [
        [
            "System note for this turn:",
            "The user attached one or more images in this message and you can inspect those images directly.",
            "Ignore any earlier statements in this conversation claiming that you could not view images or attachments, because those may have come from a previous model or an earlier limitation.",
            "If an image is blurry or unreadable, say that it is blurry or unreadable instead of saying that you cannot view images.",
        ].join(" "),
    ];

    if (trimmedText) {
        promptSections.push(trimmedText);
    }

    return promptSections.join("\n\n");
}

function isImageFile(file: PromptSessionFilePartInput): boolean {
    return file.mime.trim().toLowerCase().startsWith("image/");
}

function hasImageFiles(files: PromptSessionFilePartInput[]): boolean {
    return files.some(isImageFile);
}
