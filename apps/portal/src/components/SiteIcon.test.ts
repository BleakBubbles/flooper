import { describe, expect, it } from "vitest";
import { isLocalAddress } from "./SiteIcon";

describe("isLocalAddress", () => {
  it("counts this machine and private networks as local", () => {
    for (const origin of [
      "http://localhost:5174",
      "http://app.localhost:3000",
      "http://printer.local",
      "http://127.0.0.1:8080",
      "http://0.0.0.0:3000",
      "http://10.0.0.5",
      "http://172.16.4.2",
      "http://172.31.255.1",
      "http://192.168.1.20:8000",
      "http://169.254.10.10",
      "http://100.101.102.103",
      "http://[::1]:5173",
      "http://[fe80::1]",
      "http://[fd12:3456::1]",
      "not a url",
    ]) {
      expect(isLocalAddress(origin), origin).toBe(true);
    }
  });

  it("leaves public sites alone", () => {
    for (const origin of [
      "https://flooper.app",
      "https://www.example.com",
      "https://localhost-tips.com",
      "https://my.local-shop.com",
      "http://172.32.0.1",
      "http://8.8.8.8",
      "http://[2606:4700::1111]",
    ]) {
      expect(isLocalAddress(origin), origin).toBe(false);
    }
  });
});
