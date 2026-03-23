async function main() {
  console.log(
    [
      "backfill-conversation-cases.ts is retired.",
      "The customer memory system was rebuilt around customer_memory_v2 and no legacy backfill path is supported.",
      "If data migration is required, write a dedicated one-off migration against the new schema."
    ].join(" ")
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
