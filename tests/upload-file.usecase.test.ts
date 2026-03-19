import assert from "node:assert/strict";
import test from "node:test";
import { UploadFileUseCase } from "../src/use-cases/upload-file.usecase.js";

test("UploadFileUseCase downloads Telegram images and converts them into OpenCode file parts", async () => {
    const useCase = new UploadFileUseCase({
        async downloadFile(input) {
            assert.equal(input.filePath, "photos/file_42.jpg");

            return {
                data: Uint8Array.from([255, 216, 255]),
                mimeType: "image/jpeg",
            };
        },
    });

    const result = await useCase.execute({
        expectedType: "image",
        filePath: "photos/file_42.jpg",
        filename: "telegram.jpg",
        mimeType: "image/jpeg",
    });

    assert.deepEqual(result, {
        filename: "telegram.jpg",
        mime: "image/jpeg",
        url: "data:image/jpeg;base64,/9j/",
    });
});

test("UploadFileUseCase rejects non-image uploads", async () => {
    const useCase = new UploadFileUseCase({
        async downloadFile() {
            return {
                data: Uint8Array.from([1, 2, 3]),
                mimeType: "application/pdf",
            };
        },
    });

    await assert.rejects(
        useCase.execute({
            expectedType: "image",
            filePath: "files/file_42.bin",
            filename: "file.bin",
            mimeType: "application/pdf",
        }),
        (error: unknown) => {
            assert.equal(
                error instanceof Error ? error.name : null,
                "ImageMessageUnsupportedError",
            );
            return true;
        },
    );
});
