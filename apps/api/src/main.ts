try {
  process.loadEnvFile?.('.env');
} catch {
  /* no .env file — rely on the real environment */
}
import { createApp } from './app';
import { env } from './env';

async function main() {
  const app = await createApp();
  const port = env().PORT;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`JewelRoute API listening on http://localhost:${port} (docs: /docs)`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
