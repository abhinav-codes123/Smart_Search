export function extractMetadata(
  text
) {

  const lines =
    text
      .split("\n")
      .map(
        line => line.trim()
      )
      .filter(Boolean);

  const metadata = {};

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i]
        .toLowerCase();

    if (
      line.includes("name")
    ) {

      metadata.name =
        lines[i + 1];
    }

    if (
      line.includes(
        "organisation"
      ) ||
      line.includes(
        "organization"
      )
    ) {

      metadata.organization =
        lines[i + 1];
    }
  }

  return metadata;
}
