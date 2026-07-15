type OwnedRecord = { ownerUserId: string };

export function assertRecordsBelongToOwner<TRecord extends OwnedRecord>(ownerUserId: string, records: TRecord[]) {
  const foreignRecord = records.find((record) => record.ownerUserId !== ownerUserId);
  if (foreignRecord) {
    throw new Error("Локальная очередь содержит данные другого пользователя. Отправка остановлена без удаления данных.");
  }

  return records;
}
