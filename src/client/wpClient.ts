import { request } from 'undici';
import pRetry from 'p-retry';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ClientOpts {
  baseUrl: string;
  username: string;
  appPassword: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  totalPages: number;
}

export class WordPressClient {
  private readonly auth: string;
  private readonly base: string;

  constructor(private opts: ClientOpts) {
    this.auth = Buffer.from(`${opts.username}:${opts.appPassword}`).toString('base64');
    this.base = opts.baseUrl.replace(/\/$/, '');
  }

  /**
   * General API call with automatic retry and JSON body.
   */
  async call<T = unknown>(
    path: string,
    method: HttpMethod = 'GET',
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const url = `${this.base}${path}`;

    const execute = async () => {
      const res = await request(url, {
        method,
        headers: {
          Authorization: `Basic ${this.auth}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      if (res.statusCode >= 400) {
        const text = await res.body.text();
        let msg = `HTTP ${res.statusCode}: ${text}`;
        try {
          const err = JSON.parse(text);
          if (err.message) msg = `WordPress API error [${err.code ?? res.statusCode}]: ${err.message}`;
        } catch { /* use raw text */ }
        throw new Error(msg);
      }

      if (res.statusCode === 204) return undefined as T;
      return res.body.json() as Promise<T>;
    };

    return pRetry(execute, {
      retries: 2,
      factor: 2,
      minTimeout: 500,
      maxTimeout: 3000,
    });
  }

  /**
   * List call that captures X-WP-Total and X-WP-TotalPages headers.
   */
  async list<T = unknown>(path: string): Promise<PaginatedResult<T>> {
    const url = `${this.base}${path}`;

    const execute = async () => {
      const res = await request(url, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${this.auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.statusCode >= 400) {
        const text = await res.body.text();
        let msg = `HTTP ${res.statusCode}: ${text}`;
        try {
          const err = JSON.parse(text);
          if (err.message) msg = `WordPress API error [${err.code ?? res.statusCode}]: ${err.message}`;
        } catch { /* use raw text */ }
        throw new Error(msg);
      }

      const data = (await res.body.json()) as T[];
      const total = parseInt(res.headers['x-wp-total'] as string ?? '0', 10);
      const totalPages = parseInt(res.headers['x-wp-totalpages'] as string ?? '1', 10);

      return { data, total, totalPages };
    };

    return pRetry(execute, {
      retries: 2,
      factor: 2,
      minTimeout: 500,
      maxTimeout: 3000,
    });
  }

  /**
   * Upload a binary buffer to the WordPress media endpoint.
   */
  async uploadBinary<T = unknown>(
    path: string,
    buffer: Buffer | Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<T> {
    const url = `${this.base}${path}`;

    const execute = async () => {
      const res = await request(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.auth}`,
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: buffer,
      });

      if (res.statusCode >= 400) {
        const text = await res.body.text();
        let msg = `HTTP ${res.statusCode}: ${text}`;
        try {
          const err = JSON.parse(text);
          if (err.message) msg = `WordPress API error [${err.code ?? res.statusCode}]: ${err.message}`;
        } catch { /* use raw text */ }
        throw new Error(msg);
      }

      return res.body.json() as Promise<T>;
    };

    return pRetry(execute, {
      retries: 2,
      factor: 2,
      minTimeout: 500,
      maxTimeout: 3000,
    });
  }
}
