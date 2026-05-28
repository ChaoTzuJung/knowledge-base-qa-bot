import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client === null) _client = new OpenAI();
  return _client;
}
