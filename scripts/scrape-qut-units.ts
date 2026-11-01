import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { catalogToJson, scrapeUnitCatalog } from "../lib/qutvirtual4-units"

async function main() {
  const includeLegacy = !process.argv.includes("--current-only")
  const includeCurrent = !process.argv.includes("--legacy-only")
  const maxWildcardPagesArg = process.argv.find((arg) => arg.startsWith("--max-wildcard-pages="))
  const prefixLengthArg = process.argv.find((arg) => arg.startsWith("--prefix-length="))
  const maxWildcardPages = maxWildcardPagesArg
    ? Number.parseInt(maxWildcardPagesArg.split("=")[1] ?? "", 10)
    : undefined
  const prefixLengthValue = prefixLengthArg ? Number.parseInt(prefixLengthArg.split("=")[1] ?? "", 10) : 3
  const prefixLength = prefixLengthValue === 1 || prefixLengthValue === 2 || prefixLengthValue === 3 ? prefixLengthValue : 3
  const concurrencyArg = process.argv.find((arg) => arg.startsWith("--concurrency="))
  const concurrency = concurrencyArg ? Number.parseInt(concurrencyArg.split("=")[1] ?? "", 10) : 4

  const catalog = await scrapeUnitCatalog({
    includeLegacy,
    includeCurrent,
    maxWildcardPages: Number.isFinite(maxWildcardPages) ? maxWildcardPages : undefined,
    prefixLength,
    concurrency: Number.isFinite(concurrency) ? concurrency : 4,
  })

  const outputDir = path.join(process.cwd(), "data")
  const outputPath = path.join(outputDir, "qut-unit-codes.json")
  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, catalogToJson(catalog), "utf8")

  console.log(`Wrote ${catalog.stats.total} units to ${outputPath}`)
  console.log(`  modern: ${catalog.stats.modern}`)
  console.log(`  legacy: ${catalog.stats.legacy}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
