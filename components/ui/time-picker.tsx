import { Clock3 } from "lucide-react";
import { Input } from "@/components/ui/input";

// TITLE: SHARED TIME PICKER
export function TimePicker({ value, onChange, ...props }) {
  return <Input type="time" value={value} onChange={onChange} aria-label="Time" leftIcon={<Clock3 size={16} />} {...props} />;
}
