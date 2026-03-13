import { Request, Response } from 'express';

jest.mock('../chat/chatClient', () => ({
  chatClient: {
    spaces: {
      messages: {
        create: jest.fn(),
        patch: jest.fn(),
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
const mockCallClaude = callClaude as jest.Mock;

function makeMockReq(argumentText = ' hello'): Partial<Request> {
  return {
    body: {
      chat: {
        appCommandPayload: {
          appCommandMetadata: { appCommandType: 'SLASH_COMMAND' },
          message: {
            argumentText,
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
});
