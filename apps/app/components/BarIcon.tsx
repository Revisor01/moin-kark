// Symbole der Steuerleiste; im Browser ersetzt BarIcon.web.tsx die Symbolschrift durch eingebettete Grafiken.
import { Ionicons } from "@expo/vector-icons";

export type BarIconName = "search" | "star" | "navigate";

export interface BarIconProps {
  name: BarIconName;
  size: number;
  color: string;
}

export default function BarIcon({ name, size, color }: BarIconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}
