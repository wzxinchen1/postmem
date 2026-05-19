declare class PostMemError extends Error {
    readonly status: number;
    readonly body: string;
    constructor(status: number, body: string);
    static validation(message: string): PostMemError;
    static notFound(message: string): PostMemError;
    static serverError(message: string): PostMemError;
}
declare enum StreamStatus {
    SearchingWeb = "searchingWeb",
    SearchingMemory = "searchingMemory",
    Summarizing = "summarizing",
    MemoryProgress = "memoryProgress",
    Thinking = "thinking",
    Recognizing = "recognizing",
    FetchingUrl = "fetchingUrl"
}
declare enum ThinkingEffort {
    None = "none",
    Minimal = "minimal",
    Low = "low",
    Medium = "medium",
    High = "high",
    XHigh = "xhigh"
}
declare enum DoneReason {
    Truncated = "truncated",
    InsufficientBalance = "insufficient_balance",
    ContentFiltered = "content_filtered"
}
type StreamEvent = {
    type: 'chunk';
    content: string;
    model: {
        id: string;
        name: string;
    };
} | {
    type: 'thinking';
    content: string;
} | {
    type: 'status';
    status: StreamStatus;
} | {
    type: 'messageId';
    role: 'user' | 'assistant';
    id: string;
} | {
    type: 'error';
    message: string;
} | {
    type: 'done';
    reason?: DoneReason;
    error?: string;
    userTokens?: number;
    userTotalTokens?: number;
    totalTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
};
interface ChatMessageInput {
    id: string;
    content: string;
    images?: ChatMessageImage[];
    urls?: string[];
}
interface ChatMessageImage {
    url: string;
    mimeType?: string;
}
interface ChatRequest {
    messages: ChatMessageInput[];
    conversationId?: string;
    newConversation?: boolean;
    regenerateMessageId?: string;
    modelId: string;
    kbId: string;
    thinkingEffort?: ThinkingEffort;
}
interface ChatMessage {
    id: string;
    conversationId: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    tokens: number;
    totalTokens: number;
    reasoningTokens?: number;
    memoried: boolean;
    images?: ChatMessageImage[];
    urls?: string[];
    metadata: Record<string, unknown>;
    createdAt: string;
}
interface Conversation {
    id: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
interface ChatResult {
    conversationId: string;
    fullContent: string;
    error?: string;
    userTokens?: number;
    userTotalTokens?: number;
    totalTokens?: number;
    completionTokens?: number;
    reasoningTokens?: number;
}
interface PostMemConfig {
    baseUrl: string;
    requestTimeout?: number;
    streamTimeout?: number;
}

declare class PostMemClient {
    private baseUrl;
    private streamReader;
    private requestTimeout;
    constructor(config: PostMemConfig);
    private fetchWithTimeout;
    chat(request: ChatRequest): Promise<string>;
    consume(onEvent?: (event: StreamEvent) => void, options?: {
        signal?: AbortSignal;
    }): Promise<Response | ChatResult>;
    cancel(conversationId: string): Promise<void>;
    getMessages(conversationId: string, params?: {
        page?: number;
        limit?: number;
    }): Promise<{
        messages: ChatMessage[];
        total: number;
        page: number;
        limit: number;
    }>;
    listConversations(params?: {
        page?: number;
        limit?: number;
    }): Promise<{
        conversations: Conversation[];
        total: number;
        page: number;
        limit: number;
    }>;
    getConversation(conversationId: string): Promise<Conversation>;
    createConversation(metadata?: Record<string, unknown>): Promise<Conversation>;
    deleteConversation(conversationId: string): Promise<void>;
}

interface StreamReaderConfig {
    baseUrl: string;
    requestTimeout?: number;
}
declare class StreamReader {
    private baseUrl;
    private requestTimeout;
    constructor(config: StreamReaderConfig);
    consume(onEvent: (event: StreamEvent) => void, options?: {
        signal?: AbortSignal;
    }): Promise<void>;
}

export { type ChatMessage, type ChatMessageImage, type ChatMessageInput, type ChatRequest, type ChatResult, type Conversation, DoneReason, PostMemClient, type PostMemConfig, PostMemError, type StreamEvent, StreamReader, StreamStatus, ThinkingEffort };
