import { describe, expect, it } from "vitest";
import { bonnenMailTodo } from "@/lib/admin/todo-bonnen-mail";

describe("eigenaar-taak bonnetjesmail", () => {
  it("geen taak als de vlag uit staat of de stand niet te lezen is", () => {
    expect(bonnenMailTodo({ vlagAan: false, mailbox: false, administratie: false })).toBeNull();
    expect(bonnenMailTodo(undefined)).toBeNull();
  });

  it("open zolang de vlag aan staat en er geen mailbox of administratie is, met wat er ontbreekt", () => {
    const t = bonnenMailTodo({ vlagAan: true, mailbox: true, administratie: false });
    expect(t).toMatchObject({ id: "bonnen-mail", done: false, auto: true });
    expect(t?.doneNote).toContain("een echte administratie");
    expect(t?.doneNote).not.toContain("mailbox");
    expect(bonnenMailTodo({ vlagAan: true, mailbox: false, administratie: false })?.doneNote).toContain("de mailbox voor bonnetjes en een echte administratie");
  });

  it("vinkt zichzelf af zodra beide er zijn", () => {
    expect(bonnenMailTodo({ vlagAan: true, mailbox: true, administratie: true })).toMatchObject({ done: true });
  });

  it("is gewoon Nederlands, zonder vakjargon", () => {
    const t = bonnenMailTodo({ vlagAan: true, mailbox: false, administratie: false })!;
    expect(`${t.title} ${t.why} ${t.how.join(" ")}`).not.toMatch(/deploy|container|commit|health/i);
  });
});
