import { describe, it, expect } from "vitest";
import { waLink, quizPublicUrl } from "./utils";

describe("waLink", () => {
  it("adiciona DDI 55 quando o número tem só DDD + número", () => {
    const url = waLink("(11) 98888-7777", "oi");
    expect(url).toContain("wa.me/5511988887777");
    expect(url).toContain("text=oi");
  });
  it("não duplica o DDI quando já vem com 55", () => {
    const url = waLink("5511988887777", "x");
    expect(url).toContain("wa.me/5511988887777");
  });
  it("faz encode da mensagem", () => {
    const url = waLink("11988887777", "olá, tudo bem?");
    expect(url).toContain(encodeURIComponent("olá, tudo bem?"));
  });
});

describe("quizPublicUrl", () => {
  it("monta a URL pública respeitando a origem e o base path", () => {
    const url = quizPublicUrl("dor-no-joelho");
    // jsdom origin padrão + BASE_URL "/" da vitest
    expect(url).toMatch(/\/q\/dor-no-joelho$/);
    expect(url).toContain(window.location.origin);
  });
});
