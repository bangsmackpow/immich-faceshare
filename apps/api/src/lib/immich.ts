import { logger } from "./logger.js";

export interface ImmichPerson {
  id: string;
  name: string;
  thumbnailPath: string;
  assetCount: number;
  isHidden: boolean;
  updatedAt: string;
}

export interface ImmichAssetResponse {
  id: string;
  type: "IMAGE" | "VIDEO";
  originalPath: string;
  thumbhash: string | null;
  encodedVideoPath: string | null;
  originalFileName: string;
  exifInfo: {
    dateTimeOriginal: string | null;
    latitude: number | null;
    longitude: number | null;
    city: string | null;
    country: string | null;
    model: string | null;
  } | null;
  updatedAt: string;
}

export interface ImmichSearchResponse {
  assets: {
    items: ImmichAssetResponse[];
    total: number;
  };
}

export interface ImmichPeopleResponse {
  people: ImmichPerson[];
  total: number;
  hidden: number;
}

const BASE_DELAY_MS = 1000;
const MAX_RETRIES = 3;
const FETCH_TIMEOUT_MS = 5000;

class ImmichClient {
  private baseUrl: string;
  private apiKey: string;
  private requestCount = 0;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetch<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const method = (options.method ?? "GET").toUpperCase();

    if (method !== "GET") {
      throw new Error(
        `ImmichClient: read-only — cannot ${method} ${path}`,
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await this.fetchWithTimeout(url, {
          ...options,
          method: "GET",
          headers: {
            "x-api-key": this.apiKey,
            accept: "application/json",
            ...options.headers,
          },
        });

        this.requestCount++;

        if (!res.ok) {
          const text = await res.text().catch(() => "unknown");
          throw new Error(
            `Immich API ${res.status}: ${path} — ${text.slice(0, 200)}`,
          );
        }

        if (res.headers.get("content-type")?.includes("application/json")) {
          return (await res.json()) as T;
        }

        return undefined as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          logger.warn(
            { err: lastError.message, path, attempt: attempt + 1, delay },
            "immich retry",
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError ?? new Error(`Immich request failed: ${path}`);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/api/server/ping`,
        {
          method: "GET",
          headers: {
            "x-api-key": this.apiKey,
            accept: "application/json",
          },
        },
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async getPeople(): Promise<ImmichPeopleResponse> {
    return this.fetch<ImmichPeopleResponse>(
      "/api/people?withHidden=false",
    );
  }

  async getPerson(id: string): Promise<ImmichPerson> {
    return this.fetch<ImmichPerson>(`/api/people/${encodeURIComponent(id)}`);
  }

  async searchAssetsByPerson(
    personId: string,
    afterDate?: string,
  ): Promise<ImmichSearchResponse> {
    const params = new URLSearchParams({
      personIds: personId,
      type: "IMAGE",
      page: "1",
      size: "1000",
      order: "desc",
    });
    if (afterDate) {
      params.set("updatedAfter", afterDate);
    }
    return this.fetch<ImmichSearchResponse>(
      `/api/search/metadata?${params.toString()}`,
    );
  }

  async getAssetThumbnail(assetId: string): Promise<ArrayBuffer> {
    const res = await fetch(
      `${this.baseUrl}/api/assets/${encodeURIComponent(assetId)}/thumbnail?format=JPEG`,
      {
        headers: {
          "x-api-key": this.apiKey,
          accept: "image/jpeg",
        },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Immich thumbnail ${res.status}: ${assetId}`,
      );
    }

    return res.arrayBuffer();
  }

  getRequestCount(): number {
    return this.requestCount;
  }
}

let client: ImmichClient | null = null;

export function getImmichClient(): ImmichClient {
  if (!client) {
    const baseUrl = process.env.IMMICH_URL;
    const apiKey = process.env.IMMICH_API_KEY;

    if (!baseUrl || !apiKey) {
      throw new Error(
        "Immich not configured: IMMICH_URL and IMMICH_API_KEY required",
      );
    }

    client = new ImmichClient(baseUrl, apiKey);
    logger.info({ baseUrl }, "immich client initialized");
  }
  return client;
}
