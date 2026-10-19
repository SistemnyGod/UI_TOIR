import { useRouter } from "expo-router";
import { ThemeOptions } from "@/features/profile/ThemePicker";
import { Screen } from "@/ui/Screen";
export default function ThemeRoute() { const router = useRouter(); return <Screen title="Выбор оформления" onBack={() => router.back()}><ThemeOptions /></Screen>; }
