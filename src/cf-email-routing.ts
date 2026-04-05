/**
 * Cloudflare Email Routing Destination Addresses API client.
 */

interface CfDestinationAddress {
  id: string;
  email: string;
  verified: string | null; // datetime or null
  created: string;
  modified: string;
}

interface CfApiResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

export class CfEmailRouting {
  private baseUrl: string;
  private token: string;

  constructor(accountId: string, apiToken: string) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/routing/addresses`;
    this.token = apiToken;
  }

  private async request<T>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...opts?.headers,
      },
    });
    const data = (await res.json()) as CfApiResponse<T>;
    if (!data.success) {
      const msg = data.errors?.[0]?.message || res.statusText;
      throw new Error(`Cloudflare API: ${msg}`);
    }
    return data.result;
  }

  async createDestination(email: string): Promise<CfDestinationAddress> {
    return this.request<CfDestinationAddress>("", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async getDestination(id: string): Promise<CfDestinationAddress> {
    return this.request<CfDestinationAddress>(`/${id}`);
  }

  async deleteDestination(id: string): Promise<void> {
    await this.request(`/${id}`, { method: "DELETE" });
  }

  async listDestinations(): Promise<CfDestinationAddress[]> {
    // Paginate — CF API returns max 20 per page
    const all: CfDestinationAddress[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(`${this.baseUrl}?page=${page}&per_page=50`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
      });
      const data = (await res.json()) as CfApiResponse<CfDestinationAddress[]>;
      if (!data.success) break;
      all.push(...data.result);
      if (data.result.length < 50) break;
      page++;
    }
    return all;
  }
}
