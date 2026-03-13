import { Request, Response } from 'express';

jest.mock('../chat/chatClient', () => ({
  chatClient: {
    spaces: {
      messages: {
        create: jest.fn(),
        patch: jest.fn(),
        list: jest.fn(),
      },
    },
  },
}));

jest.mock('../claude/anthropicClient', () => ({
  callClaude: jest.fn(),
}));

import { handleChatEvent } from '../handlers/chatEvent';
import { chatClient } from '../chat/chatClient';
import { callClaude } from '../claude/anthropicClient';

const mockCreate = chatClient.spaces.messages.create as jest.Mock;
const mockPatch = chatClient.spaces.messages.patch as jest.Mock;
const mockList = chatClient.spaces.messages.list as jest.Mock;
const mockCallClaude = callClaude as jest.Mock;

function makeMockReq(argumentText = ' hello'): Partial<Request> {
  return {
    body: {
      chat: {
        appCommandPayload: {
          appCommandMetadata: { appCommandType: 'SLASH_COMMAND' },
          message: {
            argumentText,
            name: 'spaces/X/messages/triggering-msg',
            space: { name: 'spaces/X' },
            thread: { name: 'spaces/X/threads/t1' },
          },
        },
      },
    },
  };
}

function makeMockRes(): Partial<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as Partial<Response>;
}

describe('handleChatEvent async lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue({ data: { messages: [] } });
  });

  it('calls chatClient.spaces.messages.create with cardsV2 Thinking card for non-empty prompt (CLDE-03)', async () => {
    mockCallClaude.mockResolvedValue('Claude reply');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: expect.stringContaining('spaces/'),
        requestBody: expect.objectContaining({ cardsV2: expect.any(Array) }),
      }),
    );
  });

  it('calls chatClient.spaces.messages.patch with Claude reply after callClaude resolves (CLDE-03)', async () => {
    mockCallClaude.mockResolvedValue('Claude reply text');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('spaces/'),
        requestBody: expect.objectContaining({ cardsV2: expect.any(Array) }),
      }),
    );
  });

  it('calls chatClient.spaces.messages.patch with error card when callClaude rejects (CLDE-04/CLDE-05)', async () => {
    mockCallClaude.mockRejectedValue(new Error('API error'));
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockPatch).toHaveBeenCalled();
  });

  it('does NOT call chatClient.spaces.messages.patch if Thinking card POST fails (early exit)', async () => {
    mockCallClaude.mockResolvedValue('Claude reply text');
    mockCreate.mockRejectedValue(new Error('Network error posting Thinking card'));
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('attempts second patch with updateMask "text" if first cardsV2 patch throws (RESP-03 fallback)', async () => {
    mockCallClaude.mockResolvedValue('Claude reply text');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch
      .mockRejectedValueOnce(new Error('cardsV2 not supported'))
      .mockResolvedValueOnce({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockPatch).toHaveBeenCalledTimes(2);
    expect(mockPatch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        updateMask: 'text',
      }),
    );
  });

  it('calls chatClient.spaces.messages.list with thread.name filter and pageSize 10 before calling Claude (CONT-01)', async () => {
    mockCallClaude.mockResolvedValue('Claude reply');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: 'spaces/X',
        pageSize: 10,
        orderBy: 'createTime DESC',
        filter: 'thread.name = "spaces/X/threads/t1"',
      }),
    );
  });

  it('excludes bot messages from context passed to callClaude (CONT-02)', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [
          { text: 'Bot says hi', sender: { type: 'BOT' } },
          { text: 'Human says hello', sender: { type: 'HUMAN' } },
        ],
      },
    });
    mockCallClaude.mockResolvedValue('Claude reply');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    const contextArg: unknown[] = mockCallClaude.mock.calls[0][1];
    expect(contextArg).toBeDefined();
    expect(contextArg.some((m: unknown) => (m as { content: string }).content === 'Bot says hi')).toBe(false);
    expect(contextArg.some((m: unknown) => (m as { content: string }).content === 'Human says hello')).toBe(true);
  });

  it('still calls Claude and posts reply when spaces.messages.list rejects with 403 (CONT-03)', async () => {
    mockList.mockRejectedValue({ code: 403 });
    mockCallClaude.mockResolvedValue('Claude reply');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    expect(mockCallClaude).toHaveBeenCalledWith(
      expect.any(String),
      [],
    );
    expect(mockPatch).toHaveBeenCalled();
  });

  it('passes non-empty context array to callClaude when messages exist (CLDE-02)', async () => {
    mockList.mockResolvedValue({
      data: {
        messages: [
          { text: 'First human message', sender: { type: 'HUMAN' } },
          { text: 'Second human message', sender: { type: 'HUMAN' } },
        ],
      },
    });
    mockCallClaude.mockResolvedValue('Claude reply');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    const contextArg = mockCallClaude.mock.calls[0][1];
    expect(Array.isArray(contextArg)).toBe(true);
    expect((contextArg as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('emits a JSON log line with requestId, spaceId, command, latencyMs, status after PATCH completes (INFRA-04)', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockCallClaude.mockResolvedValue('Claude reply');
    mockCreate.mockResolvedValue({ data: { name: 'spaces/X/messages/m1' } });
    mockPatch.mockResolvedValue({});

    const req = makeMockReq(' hello');
    const res = makeMockRes();

    await handleChatEvent(req as Request, res as Response);
    await new Promise(resolve => setImmediate(resolve));

    const jsonLogCall = consoleSpy.mock.calls.find(call => {
      try {
        const parsed = JSON.parse(call[0] as string);
        return (
          typeof parsed.requestId === 'string' &&
          typeof parsed.spaceId === 'string' &&
          typeof parsed.command === 'string' &&
          typeof parsed.latencyMs === 'number' &&
          parsed.status === 'ok'
        );
      } catch {
        return false;
      }
    });

    expect(jsonLogCall).toBeDefined();
    consoleSpy.mockRestore();
  });
});
