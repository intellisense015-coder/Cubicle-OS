"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

// TITLE: SHARED SEARCH INPUT
export function SearchInput({ value, onChange, placeholder = "Search" }) {
  return <Input value={value} onChange={onChange} placeholder={placeholder} aria-label={placeholder} leftIcon={<Search size={16} />} />;
}
