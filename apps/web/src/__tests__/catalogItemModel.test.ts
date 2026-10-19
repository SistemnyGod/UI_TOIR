import { describe, expect, it } from "vitest";
import { catalogItem } from "../../e2e/fixtures/inventoryCatalogData";
import { itemToForm, itemFormToPayload, itemToPayload, validateItemForm } from "../features/inventory/items/catalogItemModel";
describe("nomenclature writable snapshots",()=>{
 it("uses the same number conversion for validation and the submitted lifetime",()=>{const form={...itemToForm(catalogItem()),defaultLifeMonths:"1e2"};expect(validateItemForm(form)).toEqual({});expect(itemFormToPayload(form).defaultLifeMonths).toBe(100);});
 it("leaves standards untouched by the server in a visibility-only change",()=>{const item=catalogItem(),payload=itemToPayload(item,{isActive:false});expect(payload).toMatchObject({isActive:false,heightSize:item.heightSize,headSize:item.headSize,minStockQty:item.minStockQty});expect(payload).not.toHaveProperty("standards");});
 it("rejects fractional lifetime and negative price without changing form values",()=>{const form={...itemToForm(catalogItem()),defaultLifeMonths:"1,5",defaultUnitPrice:"-1"};expect(validateItemForm(form)).toMatchObject({defaultLifeMonths:expect.any(String),defaultUnitPrice:expect.any(String)});expect(form.defaultLifeMonths).toBe("1,5");});
});
