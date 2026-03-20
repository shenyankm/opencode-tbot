import type { OpenCodeAgent } from "../services/opencode/opencode.client.js";

export const DEFAULT_AGENT_NAME = "build";

export function isSelectableAgent(agent: OpenCodeAgent): boolean {
    return !agent.hidden && agent.mode !== "subagent";
}

export function getSelectableAgents(agents: OpenCodeAgent[]): OpenCodeAgent[] {
    return agents.filter((agent) => isSelectableAgent(agent));
}

export function resolveSelectedAgent(
    agents: OpenCodeAgent[],
    requestedAgentName: string | null | undefined,
): OpenCodeAgent | null {
    const visibleAgents = getSelectableAgents(agents);

    if (requestedAgentName) {
        const requestedAgent = visibleAgents.find((agent) => agent.name === requestedAgentName);

        if (requestedAgent) {
            return requestedAgent;
        }
    }

    return visibleAgents.find((agent) => agent.name === DEFAULT_AGENT_NAME) ?? null;
}
