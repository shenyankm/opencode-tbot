import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import test from "node:test";
import { createPluginSdkClient } from "../src/app/bootstrap.js";

async function withService(
    pid: number,
    run: (url: string, requests: IncomingMessage[]) => Promise<void>,
): Promise<void> {
    const requests: IncomingMessage[] = [];
    const server = createServer((request, response) => {
        requests.push(request);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ version: "2.0.29", pid, urls: [], paths: { tmp: "/tmp" } }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
        await run(`http://127.0.0.1:${address.port}`, requests);
    } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
}

test("createPluginSdkClient binds authenticated requests to the plugin location", async () => {
    await withService(process.pid, async (url, requests) => {
        const client = await createPluginSdkClient({ location: { directory: "/workspace/中文 project" } }, async (options) => {
            assert.equal(typeof options?.version, "function");
            assert.equal((options!.version as (version: string) => boolean)("1.2.27"), false);
            return { url, auth: { type: "basic", username: "opencode", password: "test-password" } };
        });
        await client.server.info();
        assert.equal(requests.length, 2);
        assert.equal(requests[0]!.url, "/api/info");
        assert.equal(requests[1]!.headers["x-opencode-directory"], encodeURIComponent("/workspace/中文 project"));
        assert.equal(requests[1]!.headers.authorization, `Basic ${Buffer.from("opencode:test-password").toString("base64")}`);
    });
});

test("createPluginSdkClient rejects an unavailable shared service", async () => {
    await assert.rejects(
        createPluginSdkClient({ location: { directory: "/workspace" } }, async () => undefined),
        /opencode serve --service/u,
    );
});

test("createPluginSdkClient rejects a service owned by another host process", async () => {
    await withService(process.pid + 1, async (url) => {
        await assert.rejects(
            createPluginSdkClient({ location: { directory: "/workspace" } }, async () => ({ url, auth: undefined })),
            /does not own this plugin instance/u,
        );
    });
});
