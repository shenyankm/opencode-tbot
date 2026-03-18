import assert from "node:assert/strict";
import test from "node:test";
import {
    OpenCodeClient,
    type OpenCodeProject,
    type OpenCodeSession,
} from "../src/services/opencode/opencode.client.js";

function createProject(id: string, worktree: string): OpenCodeProject {
    return {
        id,
        worktree,
        time: { created: 1 },
    };
}

function createSession(id: string, projectID: string, directory: string): OpenCodeSession {
    return {
        id,
        projectID,
        directory,
        title: "Session",
        version: "1",
        time: {
            created: 1,
            updated: 1,
        },
    };
}

test("createSessionForDirectory forwards directory and title to the SDK", async () => {
    const calls: unknown[] = [];
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            project: {
                list: async () => [],
                current: async () => createProject("project-1", "E:/repo-1"),
            },
            session: {
                create: async (input: unknown) => {
                    calls.push(input);
                    return createSession("session-1", "project-1", "E:/repo-1");
                },
                prompt: async () => ({
                    info: {} as never,
                    parts: [],
                }),
            },
        } as never,
    );

    const session = await client.createSessionForDirectory("E:/repo-1", "My session");

    assert.equal(session.id, "session-1");
    assert.deepEqual(calls, [
        {
            query: { directory: "E:/repo-1" },
            body: { title: "My session" },
            responseStyle: "data",
            throwOnError: true,
        },
    ]);
});

test("promptSession returns a fallback message when no text parts are returned", async () => {
    const calls: unknown[] = [];
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            project: {
                list: async () => [],
                current: async () => createProject("project-1", "E:/repo-1"),
            },
            session: {
                create: async () => createSession("session-1", "project-1", "E:/repo-1"),
                prompt: async (input: unknown) => {
                    calls.push(input);

                    return {
                        data: {
                            info: {} as never,
                            parts: [{ type: "tool" }] as never,
                        },
                    };
                },
            },
        } as never,
    );

    const result = await client.promptSession({
        sessionId: "session-1",
        prompt: "hello from telegram",
    });

    assert.equal(result.text, "OpenCode returned empty response.");
    assert.deepEqual(calls, [
        {
            path: { id: "session-1" },
            body: {
                parts: [
                    {
                        type: "text",
                        text: "hello from telegram",
                    },
                ],
            },
            responseStyle: "data",
            throwOnError: true,
        },
    ]);
});

test("listProjects and getCurrentProject also support wrapped SDK responses", async () => {
    const project = createProject("project-1", "E:/repo-1");
    const client = new OpenCodeClient(
        { baseUrl: "http://127.0.0.1:4096" },
        {
            project: {
                list: async () => ({ data: [project] }),
                current: async () => ({ data: project }),
            },
            session: {
                create: async () => ({ data: createSession("session-1", "project-1", "E:/repo-1") }),
                prompt: async () => ({
                    data: {
                        info: {} as never,
                        parts: [],
                    },
                }),
            },
        } as never,
    );

    assert.deepEqual(await client.listProjects(), [project]);
    assert.deepEqual(await client.getCurrentProject(), project);
});
