function readMessage(error: unknown): string {
  if (typeof error === "string") return error;

  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = record.message;

    if (typeof message === "string" && message.length) return message;
    if (message && typeof message === "object") {
      const nested = message as Record<string, unknown>;

      if (typeof nested.message === "string" && nested.message.length) {
        return nested.message;
      }
    }

    if (typeof record.reason === "string" && record.reason.length) {
      return record.reason;
    }
  }

  return "";
}

function isUserCancellationMessage(message: string) {
  const text = message.toLowerCase();

  return (
    text.includes("user rejected") ||
    text.includes("rejected the request") ||
    text.includes("request rejected") ||
    text.includes("action rejected") ||
    text.includes("connection cancelled") ||
    text.includes("connection canceled") ||
    text.includes("wallet was not connected") ||
    text.includes("was not sent") ||
    text.includes("sign data canceled") ||
    text.includes("sign data cancelled") ||
    text.includes("sign message canceled") ||
    text.includes("sign message cancelled") ||
    text.includes("transaction canceled") ||
    text.includes("transaction cancelled")
  );
}

export function isWalletUserCancellation(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    if (record.code === 4001 || record.code === "4001") return true;
    if (record.name === "UserRejectsError") return true;
  }

  const message = readMessage(error);

  return message.length > 0 && isUserCancellationMessage(message);
}

export function formatWalletError(error: unknown) {
  const message = readMessage(error);

  return message || "Wallet request failed";
}
