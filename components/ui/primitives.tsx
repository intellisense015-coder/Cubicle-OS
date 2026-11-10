import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { cn } from "./dialog";
import { sanitizeNumericInput } from "@/lib/number-input";
import { WorkspaceBadge } from "./workspace-badge";

export { Button } from "./button";
export { ConfirmDialog, Dialog, Modal, cn } from "./dialog";
export type { ModalProps } from "./dialog";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

export function Field({ label, hint, className = "", ...props }: FieldProps) {
  const { placeholder, type, onChange, ...inputProps } = props;
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (type === "number") event.target.value = sanitizeNumericInput(event.target.value);
    onChange?.(event);
  };
  return <label className={cn("modal-field", className)}>{label ? <span className="modal-field-label">{label}</span> : null}<input className="floating-input modal-field-input" placeholder={placeholder} type={type} onChange={handleChange} {...inputProps} />{hint ? <span className="modal-field-hint">{hint}</span> : null}</label>;
}

type SelectOption = { value: string; label: ReactNode; disabled?: boolean };
type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; searchable?: boolean; searchPlaceholder?: string; placeholder?: ReactNode; multiple?: boolean; selectedValues?: string[]; onMultiChange?: (values: string[]) => void; renderOption?: (option: SelectOption) => ReactNode; children: ReactNode };

export function SelectField({ label, hint, className = "", children, searchable = false, searchPlaceholder = "Search...", renderOption, ...props }: SelectFieldProps) {
  const { value, defaultValue, onChange, name, disabled, placeholder, multiple = false, selectedValues = [], onMultiChange, "aria-label": ariaLabel } = props;
  const options = Children.toArray(children).filter(isValidElement).map((child: any) => ({ value: String(child.props.value ?? ""), label: child.props.children, disabled: Boolean(child.props.disabled) }));
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? ""));
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedValue = value !== undefined ? String(value) : internalValue;
  const selected = options.find((option) => option.value === selectedValue);
  const selectedValueSet = new Set(selectedValues.map(String));
  const filteredOptions = searchable && searchTerm.trim()
    ? options.filter((option) => String(option.label).toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : options;

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.getBoundingClientRect().height || Math.min(256, filteredOptions.length * 44 + (searchable ? 64 : 16));
    const opensAbove = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top - menuHeight - 8 >= 16;
    setPosition({ top: opensAbove ? rect.top - menuHeight - 8 : rect.bottom + 8, left: Math.max(16, Math.min(rect.left, window.innerWidth - rect.width - 16)), width: rect.width });
  };

  useLayoutEffect(() => { if (open) updatePosition(); }, [open, filteredOptions.length]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => { if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => { window.removeEventListener("mousedown", closeOnOutside); window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
  }, [open]);

  const selectOption = (nextValue: string) => {
    if (multiple) {
      const nextValues = selectedValueSet.has(nextValue) ? selectedValues.filter((item) => String(item) !== nextValue) : [...selectedValues, nextValue];
      onMultiChange?.(nextValues);
      setSearchTerm("");
      return;
    }
    if (value === undefined) setInternalValue(nextValue);
    onChange?.({ target: { value: nextValue, name: name || "" } } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    setSearchTerm("");
  };

  const renderLabel = (option: SelectOption) => {
    if (renderOption) return renderOption(option);
    if (typeof option.label === "string" && ["private office", "cabin", "dedicated desk", "shared desk", "meeting room", "shared room", "phone booth", "event space", "shared facility"].includes(option.label.trim().toLowerCase())) {
      return <WorkspaceBadge value={option.label} />;
    }
    return option.label;
  };
  const menu = open && typeof document !== "undefined" ? createPortal(<div ref={menuRef} className="custom-select-menu" style={{ top: position.top, left: position.left, width: position.width }} role="listbox" aria-label={ariaLabel || label} aria-multiselectable={multiple || undefined}>{searchable ? <input className="custom-select-search" autoFocus value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={searchPlaceholder} aria-label={`Search ${label}`} /> : null}{filteredOptions.length ? filteredOptions.map((option) => { const isSelected = multiple ? selectedValueSet.has(option.value) : selectedValue === option.value; return <button type="button" role="option" aria-selected={isSelected} className={cn("custom-select-option", isSelected && "is-selected")} key={option.value} disabled={option.disabled} onClick={() => selectOption(option.value)}>{renderLabel(option)}<span className="custom-select-check">{isSelected ? <Check size={13} /> : null}</span></button>; }) : <span className="custom-select-empty">No matches found</span>}</div>, document.body) : null;

  const triggerValue = multiple ? (selectedValues.length ? `${selectedValues.length} selected` : placeholder || "Select options") : (selected ? renderLabel(selected) : renderLabel(options[0] || { value: "", label: placeholder || "Select an option" }));
  return <label className="modal-field"><span className="modal-field-label">{label}</span><button ref={triggerRef} type="button" className={cn("custom-select-trigger", className, hint && "has-error")} onClick={() => { setOpen((current) => !current); requestAnimationFrame(updatePosition); }} aria-expanded={open} aria-haspopup="listbox" aria-label={ariaLabel || label} disabled={disabled}>{triggerValue}<ChevronDown size={14} className={cn("custom-select-chevron", open && "is-open")} /></button>{menu}<span className={hint ? "modal-field-hint" : "modal-field-hint modal-field-hint-empty"}>{hint || " "}</span></label>;
}

export function DateField({ label, hint, ...props }: FieldProps) {
  return <Field label={label} hint={hint} type="date" {...props} />;
}

export function TimeField({ label, hint, ...props }: FieldProps) {
  return <Field label={label} hint={hint} type="time" {...props} />;
}

type PickerFieldProps = {
  label: string;
  hint?: string;
  value?: string;
  min?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

function padPickerValue(value: number) {
  return String(value).padStart(2, "0");
}

function dateToPickerValue(date: Date) {
  return `${date.getFullYear()}-${padPickerValue(date.getMonth() + 1)}-${padPickerValue(date.getDate())}`;
}

function parsePickerDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPickerDate(value?: string) {
  const date = parsePickerDate(value);
  return date ? date.toLocaleDateString("en-GB") : "dd/mm/yyyy";
}

function formatPickerTime(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "--:-- --";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);
  return date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
}

function pickerMenuPosition(trigger: HTMLButtonElement, menu: HTMLDivElement | null, fallbackHeight: number) {
  const rect = trigger.getBoundingClientRect();
  const menuHeight = menu?.getBoundingClientRect().height || fallbackHeight;
  const opensAbove = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top - menuHeight - 8 >= 16;
  return { top: opensAbove ? rect.top - menuHeight - 8 : rect.bottom + 8, left: Math.max(16, Math.min(rect.left, window.innerWidth - rect.width - 16)), width: rect.width };
}

export function DatePickerField({ label, hint, value = "", min, disabled, onChange }: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parsePickerDate(value);
  const minimumDate = parsePickerDate(min);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = selectedDate || minimumDate || new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    setPosition(pickerMenuPosition(triggerRef.current, menuRef.current, 340));
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => { if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => { window.removeEventListener("mousedown", closeOnOutside); window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
  }, [open]);

  useLayoutEffect(() => { if (open) updatePosition(); }, [open, viewMonth]);

  useEffect(() => {
    if (selectedDate) setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [value]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: firstDayOffset + daysInMonth }, (_, index) => index < firstDayOffset ? null : index - firstDayOffset + 1);
  const monthLabel = viewMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const menu = open && typeof document !== "undefined" ? createPortal(
    <div ref={menuRef} className="custom-select-menu custom-picker-menu custom-date-picker-menu" style={{ top: position.top, left: position.left, width: position.width }} role="dialog" aria-label={label}>
      <div className="custom-picker-header"><button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} aria-label="Previous month"><ChevronLeft size={14} /></button><strong>{monthLabel}</strong><button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} aria-label="Next month"><ChevronRight size={14} /></button></div>
      <div className="custom-date-weekdays">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="custom-date-grid">{days.map((day, index) => { if (!day) return <span key={`empty-${index}`} />; const nextDate = new Date(year, month, day); const nextValue = dateToPickerValue(nextDate); const isDisabled = Boolean(min && nextValue < min); return <button type="button" key={nextValue} className={selectedDate && nextValue === dateToPickerValue(selectedDate) ? "is-selected" : ""} disabled={isDisabled} onClick={() => { onChange?.(nextValue); setOpen(false); }}>{day}</button>; })}</div>
    </div>,
    document.body,
  ) : null;

  return <label className="modal-field"><span className="modal-field-label">{label}</span><button ref={triggerRef} type="button" className={cn("custom-select-trigger custom-picker-trigger", hint && "has-error")} onClick={() => { setOpen((current) => !current); requestAnimationFrame(updatePosition); }} aria-expanded={open} aria-haspopup="dialog" disabled={disabled}>{formatPickerDate(value)}<CalendarDays size={14} /></button>{menu}<span className={hint ? "modal-field-hint" : "modal-field-hint modal-field-hint-empty"}>{hint || " "}</span></label>;
}

export function TimePickerField({ label, hint, value = "", min, disabled, onChange }: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const options = Array.from({ length: 96 }, (_, index) => `${padPickerValue(Math.floor(index / 4))}:${padPickerValue((index % 4) * 15)}`);
  if (value && !options.includes(value)) options.push(value);
  if (min && !options.includes(min)) options.push(min);
  options.sort();

  const updatePosition = () => {
    if (!triggerRef.current) return;
    setPosition(pickerMenuPosition(triggerRef.current, menuRef.current, 256));
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event: MouseEvent) => { if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => { window.removeEventListener("mousedown", closeOnOutside); window.removeEventListener("keydown", closeOnEscape); window.removeEventListener("resize", updatePosition); window.removeEventListener("scroll", updatePosition, true); };
  }, [open]);

  useLayoutEffect(() => { if (open) updatePosition(); }, [open, options.length]);

  const menu = open && typeof document !== "undefined" ? createPortal(
    <div ref={menuRef} className="custom-select-menu custom-picker-menu custom-time-picker-menu" style={{ top: position.top, left: position.left, width: position.width }} role="listbox" aria-label={label}>{options.map((option) => { const isDisabled = Boolean(min && option < min); return <button type="button" role="option" aria-selected={value === option} className={cn("custom-select-option", value === option && "is-selected")} key={option} disabled={isDisabled} onClick={() => { onChange?.(option); setOpen(false); }}>{formatPickerTime(option)}<span className="custom-select-check">{value === option ? <Check size={13} /> : null}</span></button>; })}</div>,
    document.body,
  ) : null;

  return <label className="modal-field"><span className="modal-field-label">{label}</span><button ref={triggerRef} type="button" className={cn("custom-select-trigger custom-picker-trigger", hint && "has-error")} onClick={() => { setOpen((current) => !current); requestAnimationFrame(updatePosition); }} aria-expanded={open} aria-haspopup="listbox" disabled={disabled}>{formatPickerTime(value)}<Clock3 size={14} /></button>{menu}<span className={hint ? "modal-field-hint" : "modal-field-hint modal-field-hint-empty"}>{hint || " "}</span></label>;
}
