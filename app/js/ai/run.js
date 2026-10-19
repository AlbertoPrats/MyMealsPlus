// Send a task to the model and parse its reply. If the reply can't be used
// (not JSON, missing fields...), the model is asked once to correct it,
// with the problem explained, before giving up.

import { AiFormatError, repairFollowUp } from "../core/ai-recipes.js";
import { complete } from "./providers.js";

export async function runTask({ providerId, apiKey, model, task, parse, fetchImpl }) {
  const text = await complete(providerId, { apiKey, model, task, fetchImpl });
  try {
    return parse(text);
  } catch (e) {
    if (!(e instanceof AiFormatError)) throw e;
    const fixed = await complete(providerId, { apiKey, model, task, followUp: repairFollowUp(text, e.message), fetchImpl });
    return parse(fixed); // a second failure is shown to the user
  }
}
