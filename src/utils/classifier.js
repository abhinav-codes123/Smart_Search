export function classifyDocument(text) {

  const lower = text.toLowerCase();

  const scores = {
    Certificate: 0,
    Resume: 0,
    Technical: 0,
    Medical: 0,
    Identity: 0,
  };

  // Certificate

  if (lower.includes("certificate"))
    scores.Certificate += 5;

  if (lower.includes("participation"))
    scores.Certificate += 3;

  if (lower.includes("congratulations"))
    scores.Certificate += 3;

  // Resume

  if (lower.includes("education"))
    scores.Resume += 2;

  if (lower.includes("skills"))
    scores.Resume += 2;

  if (lower.includes("experience"))
    scores.Resume += 2;

  if (lower.includes("projects"))
    scores.Resume += 2;

  // Technical

  if (lower.includes("database"))
    scores.Technical += 3;

  if (lower.includes("sql"))
    scores.Technical += 3;

  if (lower.includes("system"))
    scores.Technical += 2;

  if (lower.includes("design"))
    scores.Technical += 2;

  // Medical

  if (lower.includes("patient"))
    scores.Medical += 3;

  if (lower.includes("hemoglobin"))
    scores.Medical += 3;

  // Identity

  if (lower.includes("aadhaar"))
    scores.Identity += 4;

  if (lower.includes("permanent account number"))
    scores.Identity += 4;

  // adding more conditions

  if (lower.includes("organisation"))
  scores.Certificate += 3;

    if (lower.includes("organization"))
    scores.Certificate += 3;

    if (lower.includes("participant"))
    scores.Certificate += 2;

    if (lower.includes("summit"))
    scores.Certificate += 2;

  const winner =
    Object.entries(scores)
      .sort((a, b) => b[1] - a[1])[0];

  if (winner[1] === 0)
    return "Unknown";

  return winner[0];
}