import type { InventoryPpeEmployeeDetailsDto } from "../../../api/contracts";
import type { PpeEmployeeCardDetails } from "./ppeTypes";

export function createEmptyEmployeeDetails(): PpeEmployeeCardDetails {
  return {
    clothingSize: "",
    gender: "",
    handProtectionSize: "",
    headSize: "",
    height: "",
    respiratorSize: "",
    shoeSize: "",
  };
}

export function toApiEmployeeDetails(details: PpeEmployeeCardDetails | undefined): InventoryPpeEmployeeDetailsDto {
  return {
    clothingSize: details?.clothingSize ?? "",
    gender: details?.gender ?? "",
    handProtectionSize: details?.handProtectionSize ?? "",
    headSize: details?.headSize ?? "",
    height: details?.height ?? "",
    respiratorSize: details?.respiratorSize ?? "",
    shoeSize: details?.shoeSize ?? "",
  };
}
