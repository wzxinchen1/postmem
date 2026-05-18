"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  PostMemClient: () => PostMemClient,
  PostMemError: () => PostMemError,
  StreamReader: () => StreamReader
});
module.exports = __toCommonJS(index_exports);

// src/stream-reader.ts
var import_ioredis = __toESM(require("ioredis"));
var GLOBAL_STREAM_KEY = "chat:global";
var POLL_INTERVAL_MS = 200;
var StreamReader = class {
  constructor(config) {
    this.redis = new import_ioredis.default({
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PostMemClient,
  PostMemError,
  StreamReader
});
//# sourceMappingURL=index.js.map