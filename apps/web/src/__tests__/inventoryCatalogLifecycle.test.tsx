import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryItemsScreen } from "../features/inventory/InventoryItemsScreen";
import { InventoryRepositoryProvider } from "../repositories/inventoryRepositoryContext";
import { createMockInventoryRepository } from "../repositories/mockInventoryRepository";
import { catalogItem, catalogSettings } from "../../e2e/fixtures/inventoryCatalogData";
import type { InventoryItemDto } from "../api/contracts";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function deferred<T>() { let resolve!: (value:T)=>void, reject!: (value:Error)=>void; const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}; }
function setup() {
 const repository=createMockInventoryRepository(),item=catalogItem();
 const page={rows:[item],page:1,pageSize:20,pageCount:1,total:1};
 vi.spyOn(repository,"getItems").mockResolvedValue(page);
 vi.spyOn(repository,"getSettings").mockResolvedValue(catalogSettings);
 vi.spyOn(repository,"getItemFacets").mockResolvedValue({total:1,active:1,inactive:0,categories:[],units:[],itemKinds:[],trackingTypes:[]});
 vi.spyOn(repository,"getItem").mockResolvedValue(item);
 const notify=vi.fn();
 const node=(repo=repository,canManage=true)=><InventoryRepositoryProvider value={repo}><InventoryItemsScreen initialSettings={catalogSettings} canManage={canManage} canIssue={canManage} onNavigate={vi.fn()} onNotify={notify}/></InventoryRepositoryProvider>;
 const view=render(node());return {repository,item,page,notify,view,node};
}
async function edit(){await screen.findByText(catalogItem().name,{selector:"td strong"});fireEvent.click(screen.getAllByRole("button",{name:"Редактировать"})[0]);return screen.getByRole("dialog",{name:"Редактировать позицию номенклатуры"});}

describe("nomenclature editor and list lifecycle",()=>{
 it("retains typed input on Escape and uses the same discard decision on cancel",async()=>{
  setup();const dialog=await edit();fireEvent.change(within(dialog).getByLabelText("Комментарий",{exact:true}),{target:{value:"Не потерять описание изделия"}});fireEvent.keyDown(window,{key:"Escape"});expect(screen.getByRole("dialog",{name:"Несохранённые изменения"})).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Продолжить редактирование"}));expect(within(dialog).getByLabelText("Комментарий",{exact:true})).toHaveValue("Не потерять описание изделия");fireEvent.click(within(dialog).getByRole("button",{name:"Отмена"}));fireEvent.click(screen.getByRole("button",{name:"Закрыть без сохранения"}));expect(screen.queryByRole("dialog",{name:"Редактировать позицию номенклатуры"})).toBeNull();
 });
 it("keeps rows and an open editor while refresh is pending and when it fails",async()=>{
  const f=setup();const dialog=await edit();fireEvent.change(within(dialog).getByLabelText("Комментарий",{exact:true}),{target:{value:"Ввод во время обновления"}});const pending=deferred<typeof f.page>();vi.mocked(f.repository.getItems).mockReturnValueOnce(pending.promise);fireEvent.click(screen.getByRole("button",{name:"Обновить",hidden:true}));expect(document.querySelector(".inventory-items-table tbody tr")?.textContent).toContain(f.item.name);await act(async()=>{pending.reject(new Error("Нет соединения"));await pending.promise.catch(()=>{})});expect(document.querySelector(".inventory-items-table tbody tr")?.textContent).toContain(f.item.name);expect(within(dialog).getByLabelText("Комментарий",{exact:true})).toHaveValue("Ввод во время обновления");
 });
 it("prevents duplicate writes, blocks all closing paths while pending and reports the failure in the form",async()=>{
  const f=setup(),pending=deferred<InventoryItemDto>();vi.spyOn(f.repository,"updateItem").mockReturnValue(pending.promise);const dialog=await edit();fireEvent.change(within(dialog).getByLabelText("Комментарий",{exact:true}),{target:{value:"Описание для сохранения"}});const form=dialog.querySelector("form")!;act(()=>{fireEvent.submit(form);fireEvent.submit(form)});await waitFor(()=>expect(f.repository.updateItem).toHaveBeenCalledTimes(1));expect(within(dialog).getByRole("button",{name:"Закрыть"})).toBeDisabled();fireEvent.keyDown(window,{key:"Escape"});await act(async()=>{pending.reject(new Error("Отказ записи"));await pending.promise.catch(()=>{})});expect(within(dialog).getByRole("alert")).toHaveTextContent("Отказ записи");expect(within(dialog).getByLabelText("Комментарий",{exact:true})).toHaveValue("Описание для сохранения");
 });
 it("does not notify or close another workspace after an old write resolves",async()=>{
  const f=setup(),pending=deferred<InventoryItemDto>();vi.spyOn(f.repository,"updateItem").mockReturnValue(pending.promise);const dialog=await edit();fireEvent.submit(dialog.querySelector("form")!);await waitFor(()=>expect(f.repository.updateItem).toHaveBeenCalledTimes(1));f.view.unmount();await act(async()=>{pending.resolve({...f.item,name:"Поздний ответ"});await pending.promise;});expect(f.notify).not.toHaveBeenCalled();
 });
 it("does not replace standards while preserving hidden sizes when hiding a position",async()=>{
  const f=setup();vi.spyOn(f.repository,"updateItem").mockResolvedValue({...f.item,isActive:false});await screen.findByText(f.item.name,{selector:"td strong"});fireEvent.click(screen.getByRole("button",{name:"Скрыть позицию"}));const dialog=screen.getByRole("dialog",{name:"Скрыть позицию номенклатуры"});fireEvent.click(within(dialog).getByRole("button",{name:"Скрыть позицию"}));await waitFor(()=>expect(f.repository.updateItem).toHaveBeenCalledWith(f.item.id,expect.objectContaining({isActive:false,heightSize:f.item.heightSize,headSize:f.item.headSize,minStockQty:f.item.minStockQty})));expect(vi.mocked(f.repository.updateItem).mock.calls[0][1]).not.toHaveProperty("standards");
 });
 it("keeps an accepted write when list refresh fails and retries only the list",async()=>{
  const f=setup(),saved={...f.item,comment:"Сохранённое описание"};vi.spyOn(f.repository,"updateItem").mockResolvedValue(saved);const dialog=await edit();vi.mocked(f.repository.getItems).mockRejectedValueOnce(new Error("Каталог недоступен"));fireEvent.change(within(dialog).getByLabelText("Комментарий",{exact:true}),{target:{value:saved.comment}});fireEvent.submit(dialog.querySelector("form")!);await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());expect(await screen.findByRole("alert")).toHaveTextContent("Каталог недоступен");expect(f.notify).toHaveBeenCalledWith("Позиция обновлена");expect(document.querySelector(".inventory-items-table tbody tr")?.textContent).toContain(saved.comment);fireEvent.click(screen.getByRole("button",{name:"Повторить загрузку"}));await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());expect(f.repository.updateItem).toHaveBeenCalledTimes(1);
 });
 it("detects a server change before PUT and leaves all typed fields available",async()=>{
  const f=setup();vi.spyOn(f.repository,"updateItem");const dialog=await edit();fireEvent.change(within(dialog).getByLabelText("Комментарий",{exact:true}),{target:{value:"Пользовательский текст"}});vi.mocked(f.repository.getItem).mockResolvedValue({...f.item,brandName:"Изменено на сервере"});fireEvent.submit(dialog.querySelector("form")!);expect(await within(dialog).findByRole("alert")).toHaveTextContent("Позиция изменилась на сервере");expect(f.repository.updateItem).not.toHaveBeenCalled();expect(within(dialog).getByLabelText("Комментарий",{exact:true})).toHaveValue("Пользовательский текст");
 });
 it("unmounts the old editor on repository change and never writes after its delayed preflight",async()=>{
  const f=setup(),pending=deferred<InventoryItemDto>();vi.spyOn(f.repository,"updateItem");vi.mocked(f.repository.getItem).mockReturnValue(pending.promise);const dialog=await edit();fireEvent.submit(dialog.querySelector("form")!);const next=createMockInventoryRepository();vi.spyOn(next,"getItems").mockResolvedValue({...f.page,rows:[{...f.item,id:"next-owner",name:"Запись другого пользователя"}]});vi.spyOn(next,"getItemFacets").mockResolvedValue({total:1,active:1,inactive:0,categories:[],units:[],itemKinds:[],trackingTypes:[]});f.view.rerender(f.node(next));expect(screen.queryByRole("dialog")).toBeNull();await screen.findByText("Запись другого пользователя",{selector:"td strong"});await act(async()=>{pending.resolve(f.item);await pending.promise});expect(f.repository.updateItem).not.toHaveBeenCalled();expect(f.notify).not.toHaveBeenCalled();
 });
 it("hides management and issue controls for a view-only role",async()=>{
  const f=setup();f.view.rerender(f.node(f.repository,false));await screen.findByText(f.item.name,{selector:"td strong"});expect(screen.queryByRole("button",{name:"Создать позицию"})).toBeNull();expect(screen.queryByRole("button",{name:"Редактировать"})).toBeNull();expect(screen.queryByRole("button",{name:"Выдать"})).toBeNull();expect(screen.queryByRole("button",{name:"Скрыть позицию"})).toBeNull();fireEvent.click(screen.getAllByRole("button",{name:"Открыть карточку"})[0]);expect(within(screen.getByRole("dialog")).queryByRole("button",{name:"Редактировать"})).toBeNull();
 });
 it("returns from the nested editor to the same card and restores its opener",async()=>{
  const f=setup();await screen.findByText(f.item.name,{selector:"td strong"});const opener=screen.getAllByRole("button",{name:"Открыть карточку"})[0];opener.focus();fireEvent.click(opener);const card=screen.getByRole("dialog",{name:"Карточка позиции номенклатуры"}),trigger=within(card).getByRole("button",{name:"Редактировать"});trigger.focus();fireEvent.click(trigger);expect(screen.getByRole("dialog",{name:"Редактировать позицию номенклатуры"})).toBeInTheDocument();fireEvent.keyDown(window,{key:"Escape"});expect(screen.getByRole("dialog",{name:"Карточка позиции номенклатуры"})).toBe(card);expect(trigger).toHaveFocus();fireEvent.keyDown(window,{key:"Escape"});expect(opener).toHaveFocus();
 });
 it("coalesces search typing and ignores a superseded list response",async()=>{
  const f=setup();await screen.findByText(f.item.name,{selector:"td strong"});const old=deferred<typeof f.page>();vi.mocked(f.repository.getItems).mockReturnValueOnce(old.promise);fireEvent.click(screen.getByRole("button",{name:"Обновить"}));const search=screen.getByRole("textbox",{name:"Поиск по номенклатуре"});fireEvent.change(search,{target:{value:"К"}});fireEvent.change(search,{target:{value:"Каска"}});await waitFor(()=>expect(f.repository.getItems).toHaveBeenLastCalledWith(expect.objectContaining({query:"Каска",page:1})));expect(f.repository.getItems).toHaveBeenCalledTimes(3);await act(async()=>{old.resolve({...f.page,rows:[{...f.item,name:"Устаревшая выборка"}]});await old.promise;});expect(document.querySelector(".inventory-items-table tbody tr")?.textContent).toContain(f.item.name);
 });
});
