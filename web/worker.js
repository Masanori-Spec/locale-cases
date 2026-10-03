import { generate } from "../src/core.js";
self.onmessage = async ({ data }) => {
  if (data?.type !== "generate" || !Number.isSafeInteger(data.id)) return;
  const { id, catalogText, configText } = data;
  try {
    const result = await generate(catalogText, configText);
    self.postMessage({ type: "result", id, result });
  } catch (error) {
    self.postMessage({
      type: "error",
      id,
      error: {
        code: typeof error?.code === "string" ? error.code : "WORKER_ERROR",
        message:
          typeof error?.message === "string"
            ? error.message
            : "Generation failed",
        ...(typeof error?.messageId === "string"
          ? { messageId: error.messageId }
          : {}),
      },
    });
  }
};
