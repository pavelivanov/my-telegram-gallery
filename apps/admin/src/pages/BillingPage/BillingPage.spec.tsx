import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingState } from "@/api/types";
import { BillingPage } from "./BillingPage";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  invoice: {
    isSupported: vi.fn(),
    openUrl: vi.fn(),
  },
}));

vi.mock("@/api/client", () => ({ api: mocks.api }));
vi.mock("@tma.js/sdk-react", () => ({ invoice: mocks.invoice }));
vi.mock("@/components/Page", () => ({
  Page: ({ children }: PropsWithChildren) => children,
}));

const freeState: BillingState = {
  configured: true,
  testMode: false,
  priceStars: 250,
  supportContact: "@gallery_support",
  termsUrl: "https://example.test/terms",
  privacyUrl: "https://example.test/privacy",
  graceDays: 3,
  plan: "free",
  subscription: null,
  limits: {
    albums: 5,
    photos: 100,
    storageBytes: "104857600",
    uploadBytes: 10485760,
  },
};

const proState: BillingState = {
  ...freeState,
  plan: "pro",
  subscription: {
    status: "active",
    currentPeriodEnd: "2026-08-12T12:00:00.000Z",
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function renderBilling(state: BillingState) {
  mocks.api.mockResolvedValueOnce(state);
  render(<BillingPage />);
  await screen.findByRole("heading", {
    name: state.plan === "pro" ? "Pro" : "Free",
  });
}

describe("BillingPage", () => {
  beforeEach(() => {
    mocks.invoice.isSupported.mockReturnValue(true);
    mocks.invoice.openUrl.mockResolvedValue("closed");
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps the free plan available when paid billing is unconfigured", async () => {
    await renderBilling({
      ...freeState,
      configured: false,
      priceStars: null,
      supportContact: null,
      termsUrl: null,
      privacyUrl: null,
    });

    expect(
      screen.getByText(/Paid billing is not configured/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upgrade/ })).toBeNull();
  });

  it("shows test mode and the configured legal and support links", async () => {
    await renderBilling({ ...freeState, testMode: true });

    expect(screen.getByText(/Telegram test mode/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      freeState.termsUrl,
    );
    expect(
      screen.getByRole("link", { name: "Privacy notice" }),
    ).toHaveAttribute("href", freeState.privacyUrl);
    expect(screen.getByText(/@gallery_support/)).toBeInTheDocument();
  });

  it("does not call Telegram when the client cannot open invoices", async () => {
    const user = userEvent.setup();
    await renderBilling(freeState);
    mocks.api.mockResolvedValueOnce({
      invoiceUrl: "https://t.me/$invoice_1",
      expiresAt: "2026-07-13T12:15:00.000Z",
      billing: null,
    });
    mocks.invoice.isSupported.mockReturnValue(false);

    await user.click(screen.getByRole("button", { name: /Upgrade/ }));

    expect(
      await screen.findByText(/cannot open subscription invoices/),
    ).toBeInTheDocument();
    expect(mocks.invoice.openUrl).not.toHaveBeenCalled();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it("waits for the API before presenting an upgraded plan", async () => {
    const user = userEvent.setup();
    const refreshed = deferred<BillingState>();
    await renderBilling(freeState);
    mocks.api
      .mockResolvedValueOnce({
        invoiceUrl: "https://t.me/$invoice_1",
        expiresAt: "2026-07-13T12:15:00.000Z",
        billing: null,
      })
      .mockReturnValueOnce(refreshed.promise);

    await user.click(screen.getByRole("button", { name: /Upgrade/ }));
    await waitFor(() => expect(mocks.invoice.openUrl).toHaveBeenCalledOnce());
    expect(screen.getByRole("heading", { name: "Free" })).toBeInTheDocument();

    refreshed.resolve(proState);
    expect(
      await screen.findByRole("heading", { name: "Pro" }),
    ).toBeInTheDocument();
    expect(mocks.api).toHaveBeenNthCalledWith(1, "/billing");
    expect(mocks.api).toHaveBeenNthCalledWith(2, "/billing/checkout", {
      method: "POST",
    });
    expect(mocks.api).toHaveBeenNthCalledWith(3, "/billing");
  });

  it("confirms cancellation and renders the server response", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderBilling(proState);
    mocks.api.mockResolvedValueOnce({
      ...proState,
      subscription: { ...proState.subscription!, cancelAtPeriodEnd: true },
    });

    await user.click(screen.getByRole("button", { name: "Stop renewal" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenLastCalledWith("/billing/subscription/cancel", {
      method: "POST",
    });
    expect(
      await screen.findByRole("button", { name: "Re-enable renewal" }),
    ).toBeInTheDocument();
  });

  it("re-enables renewal from the server response", async () => {
    const user = userEvent.setup();
    await renderBilling({
      ...proState,
      subscription: { ...proState.subscription!, cancelAtPeriodEnd: true },
    });
    mocks.api.mockResolvedValueOnce(proState);

    await user.click(screen.getByRole("button", { name: "Re-enable renewal" }));

    expect(mocks.api).toHaveBeenLastCalledWith(
      "/billing/subscription/re-enable",
      { method: "POST" },
    );
    expect(
      await screen.findByRole("button", { name: "Stop renewal" }),
    ).toBeInTheDocument();
  });
});
