import { closeDatabase, migrateSchema } from "../src/lib/db";

async function main() {
  await migrateSchema();
  console.log("Database schema is up to date.");
}

main()
  .then(() => closeDatabase())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
