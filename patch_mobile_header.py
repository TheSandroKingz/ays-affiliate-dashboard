path = "src/app/dashboard/layout.tsx"
with open(path) as f:
    content = f.read()

old_import = 'import Sidebar from "@/components/Sidebar";\n'
new_import = old_import + 'import Image from "next/image";\n'
if 'import Image from "next/image"' not in content:
    content = content.replace(old_import, new_import)
    print("OK: import Image agregado")
else:
    print("AVISO: import ya existia")

old_block = '''<span className="flex-1 text-center text-2xl font-extrabold text-emerald-400 pr-6">
            A & S Afiliados
          </span>'''

new_block = '''<span className="flex-1 flex justify-center pr-6">
            <Image src="/logo.png" alt="A&S Afiliados" width={120} height={59} priority />
          </span>'''

if old_block in content:
    content = content.replace(old_block, new_block)
    print("OK: header movil reemplazado por logo")
else:
    print("ERROR: no se encontro el bloque exacto")

with open(path, "w") as f:
    f.write(content)
