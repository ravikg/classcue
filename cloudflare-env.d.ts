declare namespace Cloudflare {
  interface Env {
		DB: D1Database;
		VAPID_PUBLIC_KEY?: string;
		VAPID_PRIVATE_KEY?: string;
		VAPID_SUBJECT?: string;
		OPENAI_API_KEY?: string;
		OPENAI_MODEL?: string;
    ASSETS: Fetcher;
    IMAGES: {
      input(stream: ReadableStream): {
        transform(options: Record<string, unknown>): {
          output(options: {
            format: string;
            quality: number;
          }): Promise<{ response(): Response }>;
        };
      };
    };
  }
}
