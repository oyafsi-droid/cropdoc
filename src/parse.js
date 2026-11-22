// Small models often wrap JSON in ```json fences or add a sentence, so take the outermost {...}.
export function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI reply had no answer in it. Please try again.");
  return JSON.parse(text.slice(start, end + 1));
}
