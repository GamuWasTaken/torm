#let form-schema = (
  (name: "name", label: "Name", type: "text", default: "Ada"),
  (name: "date", label: "Date", type: "date", default: "2026-01-01"),
)
#metadata(form-schema) <form-schema>

#let name = sys.inputs.at("name", default: "Ada")
#let date-parts = sys.inputs.at("date", default: "2026-01-01").split("-").map(int)
#let date = datetime(year: date-parts.at(0), month: date-parts.at(1), day: date-parts.at(2))

#set page(width: 8.5in, height: 11in, margin: 1in)

#align(center)[
  #text(size: 24pt, weight: "bold")[Hello, #name!]

  #v(1em)
  Date: #date.display("[month] [day], [year]")
]
