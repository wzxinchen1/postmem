declare class PostMemError extends Error {
    readonly status: number;
    readonly body: string;
    constructor(status: number, body: string);
}
type StreamStatus = 'searchingWeb' | 'searchingMemory' | 'summarizing' | 'memoryProgress';
type StreamEvent = {
    type: 'chunk';
    content: string;
    model: {
        id: string;
        name: string;
    };
} | {
    type: 'status';
    status: StreamStatus;
} | {
    type: 'messageId';
    role: 'user' | 'assistant';
    id: string;
} | {
    type: 'usage';
    promptTokens: number;
    completionTokens: number;
} | {
    type: 'error';
    message: string;
} | {
    type: 'done';
};
interface ChatMessageInput {
    id: string;
    content: string;
}
interface ChatRequest {
    messages: ChatMessageInput[];
    conversationId?: string;
    newConversation?: boolean;
    regenerateMessageId?: string;
    modelId: string;
    kbId: string;
}
interface ChatHandle {
    conversationId: string;
    done: Promise<ChatResult>;
}
interface ChatResult {
    conversationId: string;
    fullContent: string;
    promptTokens: number;
    completionTokens: number;
}
interface ChatMessage {
    id: string;
    conversationId: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    tokens: number;
    totalTokens: number;
    memoried: boolean;
    metadata: Record<string, unknown>;
    createdAt: string;
}
interface Conversation {
    id: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
interface PostMemConfig {
    baseUrl: string;
    requestTimeout?: number;
    redis: {
        host: string;
        port: number;
        db?: number;
        password?: string;
    };
}

declare class PostMemClient {
    private baseUrl;
    private streamReader;
    private requestTimeout;
    constructor(config: PostMemConfig);
    private fetchWithTimeout;
    chat(request: ChatRequest, onEvent?: (event: StreamEvent) => void): Promise<ChatHandle>;
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
    disconnect(): Promise<void>;
}

declare class StreamReader {
    private redis;
    constructor(config: PostMemConfig['redis']);
    consume(conversationId: string, onEvent: (event: StreamEvent) => void): Promise<{
        fullContent: string;
        promptTokens: number;
        completionTokens: number;
    }>;
    disconnect(): Promise<void>;
}

export { type ChatHandle, type ChatMessage, type ChatMessageInput, type ChatRequest, type ChatResult, type Conversation, PostMemClient, type PostMemConfig, PostMemError, type StreamEvent, StreamReader, type StreamStatus };
