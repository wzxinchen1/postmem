// src/types.ts
var PostMemError = class _PostMemError extends Error {
  constructor(status, body) {
    super(`PostMem API error: ${status} ${body}`);
    this.status = status;
    this.body = body;
    this.name = "PostMemError";
  }
  static validation(message) {
    return new _PostMemError(400, message);
  }
  static notFound(message) {
    return new _PostMemError(404, message);
  }
  static serverError(message) {
    return new _PostMemError(500, message);
  }
};
var StreamStatus = /* @__PURE__ */ ((StreamStatus2) => {
  StreamStatus2["SearchingWeb"] = "searchingWeb";
  StreamStatus2["SearchingMemory"] = "searchingMemory";
  StreamStatus2["Summarizing"] = "summarizing";
  StreamStatus2["MemoryProgress"] = "memoryProgress";
  StreamStatus2["Thinking"] = "thinking";
  StreamStatus2["Recognizing"] = "recognizing";
  StreamStatus2["FetchingUrl"] = "fetchingUrl";
  return StreamStatus2;
})(StreamStatus || {});
var ThinkingEffort = /* @__PURE__ */ ((ThinkingEffort2) => {
  ThinkingEffort2["None"] = "none";
  ThinkingEffort2["Minimal"] = "minimal";
  ThinkingEffort2["Low"] = "low";
  ThinkingEffort2["Medium"] = "medium";
  ThinkingEffort2["High"] = "high";
  ThinkingEffort2["XHigh"] = "xhigh";
  return ThinkingEffort2;
})(ThinkingEffort || {});
var DoneReason = /* @__PURE__ */ ((DoneReason2) => {
  DoneReason2["Truncated"] = "truncated";
  DoneReason2["InsufficientBalance"] = "insufficient_balance";
  DoneReason2["ContentFiltered"] = "content_filtered";
  return DoneReason2;
})(DoneReason || {});

// src/stream-reader.ts
var StreamReader = class {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.requestTimeout = config.requestTimeout ?? 0;
  }
  async consume(onEvent, options) {
    if (typeof onEvent !== "function") {
      throw PostMemError.validation("onEvent callback is required");
    }
    const externalSignal = options?.signal;
    if (externalSignal?.aborted) return;
    let retryDelay = 1e3;
    while (true) {
      if (externalSignal?.aborted) return;
      const controller = new AbortController();
      if (this.requestTimeout > 0) {
        setTimeout(() => controller.abort(), this.requestTimeout);
      }
      if (externalSignal) {
        if (externalSignal.aborted) return;
        externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      try {
        const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
          signal: controller.signal
        });
        if (!response.ok) {
          throw new PostMemError(response.status, `Stream request failed: ${response.status}`);
        }
        const reader = response.body?.getReader();
        if (!reader) {
          throw PostMemError.serverError("Failed to get response reader");
        }
        const decoder = new TextDecoder();
        let buffer = "";
        retryDelay = 1e3;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            let event;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue;
            }
            onEvent(event);
          }
        }
      } catch {
        if (externalSignal?.aborted) return;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 3e4);
    }
  }
};

// src/client.ts
var PostMemClient = class {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.requestTimeout = config.requestTimeout ?? 3e4;
    this.streamReader = new StreamReader({
      baseUrl: config.baseUrl,
      requestTimeout: config.streamTimeout ?? 3e5
    });
  }
  fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeout);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  }
  async chat(request) {
    if (!request.messages || request.messages.length === 0) {
      throw PostMemError.validation("messages \u4E0D\u80FD\u4E3A\u7A7A");
    }
    if (!request.modelId) {
      throw PostMemError.validation("modelId \u4E0D\u80FD\u4E3A\u7A7A");
    }
    if (!request.kbId) {
      throw PostMemError.validation("kbId \u4E0D\u80FD\u4E3A\u7A7A");
    }
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      throw new PostMemError(response.status, await response.text());
    }
    const body = await response.json();
    const conversationId = body.data?.conversationId ?? request.conversationId ?? "";
    if (!conversationId) {
      throw PostMemError.serverError("No conversationId returned from server");
    }
    return conversationId;
  }
  async consume(onEvent, options) {
    if (onEvent) {
      let fullContent = "";
      let error;
      let userTokens;
      let userTotalTokens;
      let totalTokens;
      let completionTokens;
      let reasoningTokens;
      let conversationId = "";
      await this.streamReader.consume((event) => {
        onEvent(event);
        switch (event.type) {
          case "chunk":
            fullContent += event.content;
            break;
          case "done":
            error = event.error ?? void 0;
            userTokens = event.userTokens;
            userTotalTokens = event.userTotalTokens;
            totalTokens = event.totalTokens;
            completionTokens = event.completionTokens;
            reasoningTokens = event.reasoningTokens;
            break;
        }
      }, { signal: options?.signal });
      return { conversationId, fullContent, error, userTokens, userTotalTokens, totalTokens, completionTokens, reasoningTokens };
    }
    const encoder = new TextEncoder();
    const reader = this.streamReader;
    const stream = new ReadableStream({
      async start(controller) {
        const signal = options?.signal;
        if (signal) {
          if (signal.aborted) {
            controller.close();
            return;
          }
          signal.addEventListener("abort", () => controller.close(), { once: true });
        }
        const keepAliveInterval = setInterval(() => {
          if (signal?.aborted) {
            clearInterval(keepAliveInterval);
            return;
          }
          controller.enqueue(encoder.encode(`: keep-alive

`));
        }, 3e4);
        try {
          await reader.consume((event) => {
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}

`));
          });
        } finally {
          clearInterval(keepAliveInterval);
        }
        controller.close();
      }
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  }
  async cancel(conversationId) {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId })
    });
    if (!response.ok) {
      throw new PostMemError(response.status, await response.text());
    }
  }
  async getMessages(conversationId, params) {
    const query = new URLSearchParams({ conversationId });
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/messages?${query}`);
    if (!res.ok) {
      throw new PostMemError(res.status, await res.text());
    }
    const json = await res.json();
    return json.data;
  }
  async listConversations(params) {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations?${query}`);
    if (!res.ok) {
      throw new PostMemError(res.status, `List conversations failed: ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  }
  async getConversation(conversationId) {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations/${conversationId}`);
    if (!res.ok) {
      throw new PostMemError(res.status, `Get conversation failed: ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  }
  async createConversation(metadata) {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata })
    });
    if (!res.ok) {
      throw new PostMemError(res.status, `Create conversation failed: ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  }
  async deleteConversation(conversationId) {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations?id=${conversationId}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      throw new PostMemError(res.status, `Delete conversation failed: ${res.status}`);
    }
  }
};
export {
  DoneReason,
  PostMemClient,
  PostMemError,
  StreamReader,
  StreamStatus,
  ThinkingEffort
};
//# sourceMappingURL=index.mjs.map