// src/stream-reader.ts
import Redis from "ioredis";
var GLOBAL_STREAM_KEY = "chat:global";
var POLL_INTERVAL_MS = 200;
var StreamReader = class {
  constructor(config) {
    this.redis = new Redis({
      host: config.host,
      port: config.port,
      db: config.db ?? 5,
      password: config.password,
      enableReadyCheck: false,
      maxRetriesPerRequest: null
    });
  }
  async consume(onEvent) {
    if (typeof onEvent !== "function") {
      throw new Error("onEvent callback is required");
    }
    let lastId = "0-0";
    while (true) {
      const result = await this.redis.xread("STREAMS", GLOBAL_STREAM_KEY, lastId);
      if (result && result.length > 0) {
        const [, messages] = result[0];
        for (const [msgId, fields] of messages) {
          lastId = msgId;
          const parsed = {};
          for (let i = 0; i < fields.length; i += 2) {
            parsed[fields[i]] = fields[i + 1];
          }
          const event = JSON.parse(parsed.data);
          onEvent(event);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  async disconnect() {
    await this.redis.quit();
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
    this.streamReader = new StreamReader(config.redis);
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
  async consume(onEvent) {
    await this.streamReader.consume(onEvent);
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
  async disconnect() {
    await this.streamReader.disconnect();
  }
};
export {
  PostMemClient,
  PostMemError,
  StreamReader
};
//# sourceMappingURL=index.mjs.map