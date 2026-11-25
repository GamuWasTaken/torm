#let form-schema = (
  (name: "name", label: "Name", type: "text", default: "Ada"),
  (name: "copies", label: "Copies", type: "number", default: "3"),
  (name: "enabled", label: "Enabled", type: "boolean", default: "true"),
  (name: "language", label: "Language", type: "select", options: ("en", "fr", "es"), default: "en"),
  (name: "due", label: "Due date", type: "date", default: "2026-12-31"),
  (name: "notes", label: "Notes", type: "textarea", default: "First line\nSecond line"),
)
#metadata(form-schema) <form-schema>

#let name = sys.inputs.at("name", default: "Ada")
#let copies = int(sys.inputs.at("copies", default: "3"))
#let enabled = sys.inputs.at("enabled", default: "true") == "true"
#let language = sys.inputs.at("language", default: "en")
#let due-parts = sys.inputs.at("due", default: "2026-12-31").split("-").map(int)
#let due = datetime(year: due-parts.at(0), month: due-parts.at(1), day: due-parts.at(2))
#let notes = sys.inputs.at("notes", default: "First line\nSecond line")

#set page(width: 8.5in, height: 11in, margin: 1in)

#text(size: 22pt, weight: "bold")[Input type sample]

#v(1em)

#table(
  columns: (auto, 1fr),
  stroke: 0.5pt + gray,
  inset: 8pt,
  [Field], [Value],
  [Text], [#name],
  [Number], [#copies],
  [Boolean], [#enabled],
  [Select], [#language],
  [Date], [#due.display("[month] [day], [year]")],
  [Textarea], [#notes],
)
