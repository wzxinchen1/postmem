// src/stream-reader.ts
var StreamReader = class {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.requestTimeout = config.requestTimeout ?? 3e5;
  }
  async consume(onEvent) {
    if (typeof onEvent !== "function") {
      throw new Error("onEvent callback is required");
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);
    try {
      const response = await fetch(`${this.baseUrl}/api/chat/stream`, {
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Stream request failed: ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }
      const decoder = new TextDecoder();
      let buffer = "";
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
          if (event.type === "done" || event.type === "error") {
            return;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
};

// src/types.ts
var PostMemError = class extends Error {
  constructor(status, body) {
    super(`PostMem API error: ${status} ${body}`);
    this.status = status;
    this.body = body;
    this.name = "PostMemError";
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
      throw new Error("No conversationId returned from server");
    }
    return conversationId;
  }
  async consume(onEvent, options) {
    if (onEvent) {
      let fullContent = "";
      let promptTokens = 0;
      let completionTokens = 0;
      let conversationId = "";
      await this.streamReader.consume((event) => {
        onEvent(event);
        switch (event.type) {
          case "chunk":
            fullContent += event.content;
            break;
          case "usage":
            promptTokens = event.promptTokens;
            completionTokens = event.completionTokens;
            break;
        }
      });
      return { conversationId, fullContent, promptTokens, completionTokens };
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
      throw new Error(`Get messages failed: ${res.status}`);
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
      throw new Error(`List conversations failed: ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  }
  async getConversation(conversationId) {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations/${conversationId}`);
    if (!res.ok) {
      throw new Error(`Get conversation failed: ${res.status}`);
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
      throw new Error(`Create conversation failed: ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  }
  async deleteConversation(conversationId) {
    const res = await this.fetchWithTimeout(`${this.baseUrl}/api/chat/conversations?id=${conversationId}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      throw new Error(`Delete conversation failed: ${res.status}`);
    }
  }
};
export {
  PostMemClient,
  PostMemError,
  StreamReader
};
//# sourceMappingURL=index.mjs.map