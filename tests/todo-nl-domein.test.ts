import { describe, expect, it } from "vitest";

import { nlDomeinTodo, wijstNaarPlatform } from "@/lib/admin/todo-nl-domein";

describe("zekerflex.nl naar het platform", () => {
  it("ziet dat het .nl-domein elders staat (de stand van 28 nov 2026)", () => {
    // gemeten: zekerflex.nl stond op AWS-adressen van de websitebouwer, zekerflex.com op onze eigen server
    const stand = { nl: ["3.73.27.108", "3.125.172.46"], com: ["37.97.226.24"] };
    expect(wijstNaarPlatform(stand)).toBe(false);

    const todo = nlDomeinTodo(stand);
    expect(todo).not.toBeNull();
    expect(todo!.done).toBe(false);
    expect(todo!.auto).toBe(true);
    expect(todo!.group).toBe("Vindbaarheid & app");
    // de stappen moeten het echte serveradres noemen, anders kan de eigenaar er niets mee
    expect(todo!.how.join(" ")).toContain("37.97.226.24");
  });

  it("vinkt zichzelf af zodra .nl en .com dezelfde server hebben", () => {
    const stand = { nl: ["37.97.226.24"], com: ["37.97.226.24"] };
    expect(wijstNaarPlatform(stand)).toBe(true);

    const todo = nlDomeinTodo(stand);
    expect(todo!.done).toBe(true);
    expect(todo!.doneNote).toContain("37.97.226.24");
  });

  it("één gedeeld adres is genoeg (een server mag meerdere adressen hebben)", () => {
    expect(wijstNaarPlatform({ nl: ["37.97.226.24", "1.2.3.4"], com: ["37.97.226.24"] })).toBe(true);
  });

  it("geen A-record is niet hetzelfde als goed ingesteld", () => {
    expect(wijstNaarPlatform({ nl: [], com: ["37.97.226.24"] })).toBe(false);
    // en als we ons eigen domein niet kunnen lezen, durven we niets te beweren
    expect(wijstNaarPlatform({ nl: ["37.97.226.24"], com: [] })).toBe(false);
  });

  it("toont geen taak als de DNS niet te lezen was", () => {
    expect(nlDomeinTodo(undefined)).toBeNull();
  });

  it("legt in gewoon Nederlands uit wat er mis is en noemt de verlenging", () => {
    const todo = nlDomeinTodo({ nl: ["3.73.27.108"], com: ["37.97.226.24"] })!;
    expect(todo.why).toContain("zekerflex.com");
    expect(todo.how.join(" ")).toContain("ZXCS");
    // de rekening komt rond 10 december; een vrijgevallen .nl met de merknaam is een echt risico
    expect(todo.how.join(" ")).toContain("10 december");
  });
});
