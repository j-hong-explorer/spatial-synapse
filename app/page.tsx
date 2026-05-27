import { ConceptGraph } from "@/components/ConceptGraph";
import { concepts } from "@/lib/concepts";

export default function Home() {
  return <ConceptGraph concepts={concepts} />;
}
