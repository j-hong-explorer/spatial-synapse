import { DiceRoller } from "@/components/DiceRoller";
import { concepts } from "@/lib/concepts";

export default function RollPage() {
  return <DiceRoller concepts={concepts} />;
}
