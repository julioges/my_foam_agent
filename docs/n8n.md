# Foam-Agent en n8n con AI Agent, Ollama y memoria local

Importa `FOAM_AGENT_N8N_AI_AGENTS.json` en n8n 2.46.6. Esta versión sustituye el JSON anterior de 75 nodos: ahora tiene **107 nodos**, porque incorpora los subnodos nativos del sistema de agentes y pasos explícitos de importación y comprobación. Referencia inspeccionada de main: `db9ff3ce2d1213ebb8f8fe463b32f36dab72c974`.

## Agentes y conexiones

Hay ocho nodos **AI Agent** independientes:

1. Preparación.
2. Planificador Malla.
3. Planificador Solver.
4. Escritor Secuencial.
5. Revisor Estático.
6. Revisor Malla.
7. Revisor Solver.
8. Visualización.

Cada uno tiene tres subnodos conectados a sus puertos nativos:

| Subnodo | Conexión | Configuración |
| --- | --- | --- |
| Ollama Chat Model | `ai_languageModel` | `devstral-small-2:24b`, temperatura 0.1, contexto 32768, salida máxima 8192 |
| Simple Memory | `ai_memory` | Memoria local, dos interacciones, clave distinta por agente y ejecución |
| Structured Output Parser | `ai_outputParser` | Esquema JSON específico del agente |

Los agentes generan planes, archivos, revisiones y código de visualización. Los nodos Execute Command realizan las escrituras y ejecutan OpenFOAM. No hay llamadas HTTP directas que suplanten a los agentes ni un servicio externo de Foam-Agent/MCP/LangGraph. Seis HTTP Request Tool nativos (`n8n-nodes-base.httpRequestTool` 4.2) están conectados al puerto `ai_tool` de los planificadores, escritor y revisores; consultan referencias faltantes de Foundation v10.

## Conectar tu Ollama de Windows

El modelo **ya instalado** `devstral-small-2:24b` está seleccionado literalmente en los ocho nodos Ollama Chat Model. Este workflow no descarga ni instala modelos.

Tras importar, selecciona tu credencial Ollama en cada uno de esos ocho nodos. Puedes reutilizar la misma credencial. No se incluyen identificadores de credenciales inventados: los IDs pertenecen a cada instalación de n8n.

En esa credencial:

- Si Docker Desktop y Ollama están en el mismo Windows, Base URL: `http://host.docker.internal:11434`.
- Si Docker corre en otro ordenador, Base URL: `http://IP_PRIVADA_DE_WINDOWS:11434`.
- Una instalación Ollama estándar no necesita API key.

La URL se configura en la **credencial Ollama**, no en el nodo Configuración del workflow. Desde Docker, `localhost` es el propio contenedor. Ollama debe escuchar en una interfaz alcanzable y el firewall debe permitir el acceso desde el host/red de Docker.

## Qué conserva la memoria

Cada Simple Memory usa una clave que combina `run_id` con el rol del agente. Así recuerda las interacciones de ese agente durante sus iteraciones, sin mezclar simulaciones ni agentes distintos. Los AI Agent limitan la lectura de memoria a 4096 tokens; los datos canónicos y la evidencia actual prevalecen sobre el historial.

Es memoria **local en RAM de n8n**, sin Redis ni Postgres. No es persistencia en disco: se pierde al reiniciar n8n, y el nodo elimina los buffers que lleven una hora sin usarse. Simple Memory no es compatible con Queue Mode ni Multi-Main. El Compose suministrado utiliza una sola instancia de n8n.

Los archivos del caso y `report.json` sí persisten en el volumen `foam_runs`; son independientes de la memoria del chat.

## Preparar la ejecución de OpenFOAM

La imagen estándar de n8n no contiene OpenFOAM. Usa el Dockerfile y Compose de `examples/n8n/` para tener n8n 2.46.6, Node 24, Foundation OpenFOAM v10, Gmsh y PyVista en un único contenedor. No se monta el socket de Docker ni se necesita otro servicio de ejecución.

Antes de cambiar tu imagen, conserva una copia del volumen actual de n8n. Obtén su nombre exacto:

```bash
docker inspect NOMBRE_CONTENEDOR --format '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Name}}{{end}}{{end}}'
```

En `examples/n8n/`, crea `.env`:

```dotenv
N8N_DATA_VOLUME=nombre_real_del_volumen_actual
```

Después:

```bash
cd examples/n8n
mkdir -p inputs
docker compose build n8n
docker compose up -d n8n
```

El Compose conserva los puertos/IP, la zona Europe/Madrid y las variables de la configuración proporcionada. Si la IP de escucha no pertenece a ese host, ajústala. Si el contenedor anterior sigue ocupando 5678, detenlo antes de arrancar el nuevo. No uses `down -v`.

El Compose habilita Execute Command mediante `NODES_EXCLUDE` y los builtins `fs,path,crypto` utilizados por los nodos Code. Si ya utilizas runners externos, permite `zlib` también en su configuración. Ejecuta únicamente workflows de confianza: los scripts CFD tienen acceso a los archivos del contenedor.

## Ejecutar y consultar resultados

1. Importa el JSON y conecta la credencial de Ollama en los ocho modelos.
2. Edita `Configuracion y estado`: prompt y rutas opcionales de entrada.
3. Ejecuta el disparador manual.

`case_path` puede ser `/inputs/caso` o `/inputs/caso.zip`; `custom_mesh_path` debe ser una malla Gmsh ASCII 2.2 bajo `/inputs`. Las rutas corresponden al contenedor, no a Windows.

El flujo conserva los bucles de revisión estática y reparación de malla/solver, detecta falta de progreso y verifica registros nativos y campos recientes. La visualización fallida tras completar el solver produce `partial_success`. Una petición física incompleta termina en `needs_input`; completa el prompt y vuelve a ejecutar.

Resultados: `/data/runs/n8n_<execution_id>/`. Para copiarlos al host:

```bash
docker compose cp n8n:/data/runs/n8n_ID ./resultado-n8n_ID
```

Alcance actual: Foundation v10 local y recuperación léxica de tutoriales. No reproduce FAISS, HPC/Slurm, ESI v2006 ni todas las funciones especializadas del repositorio original. `fast` omite la revisión estática inicial, pero el escritor sigue siendo secuencial.

## Validación

Las versiones y parámetros de AI Agent 3.1, Ollama Chat Model 1, Simple Memory 1.4 y Structured Output Parser 1.3 se contrastaron con el paquete oficial `@n8n/n8n-nodes-langchain@2.46.6`, verificando su integridad npm.

Pruebas del workflow exportado:

```bash
node tests/n8n_workflow.cjs
```

Estas pruebas verifican las conexiones nativas, los ocho modelos, la separación de claves de memoria, los esquemas y 19 escenarios simulados de ejecución y reparación. Ejecutan los Code, las expresiones y el código mecánico del JSON; simulan las respuestas del modelo y las herramientas CFD. No demuestran una simulación real con tu Windows/Ollama. La imagen Docker ampliada y una simulación CFD real siguen pendientes de validación en tu instalación.

## Código y comandos legibles

Toda la gestión de directorios, importación, archivos canónicos, scripts Allmesh/Allrun, restauración, huellas de entradas, límites, registros y verificación de campos está implementada en JavaScript visible en los nodos Code. No hay Base64, compresión de código/estado, eval, ni un intérprete externo que ejecute la orquestación.

Execute Command invoca directamente `unzip`, utilidades OpenFOAM y, para la visualización, `xvfb-run -a python3 visualize.py`. El script de PyVista lo genera el agente y lo escribe un nodo Code como archivo legible; únicamente renderiza, no orquesta el grafo. Los comandos nativos tienen timeout y su código de salida real se guarda en un archivo que comprueba un nodo Code. El éxito del comando envolvente no se confunde con el del solver.

Los archivos comprimidos `.gz` y los binarios se conservan como activos, pero no se interpretan para generar contexto ni se validan como campos recientes. Los agentes reciben la instrucción de generar resultados con `writeCompression off`. ZIP64, ZIP cifrados, nombres no UTF-8/ASCII, enlaces simbólicos y archivos especiales quedan fuera del importador. Los ZIP admitidos se validan antes de extraer, con límites de entradas y tamaño.

## Correspondencia con main

| Etapa original | Implementación en n8n | Fidelidad / adaptación |
| --- | --- | --- |
| `preparation_node` / `services.preparation` | Preparación de directorios, validación ZIP, importación, preflight y AI Agent Preparación | Carpeta/ZIP y preguntas físicas; formatos y activos sujetos a los límites descritos |
| `meshing_planner_node` | AI Agent Planificador Malla | Elección Standard/Gmsh/Custom y operaciones explícitas |
| `standard_meshing`, `gmsh_meshing`, `custom_meshing` | Rutas de backend, escritor, Allmesh y checkMesh | Ejecución local; sin todas las reconstrucciones avanzadas de particiones de main |
| `solver_planner_node` | AI Agent Planificador Solver | Usa fronteras reales y conserva reparaciones físicas pendientes |
| `input_writer_node` | AI Agent Escritor Secuencial y Code de escritura | Un archivo por llamada, scripts separados por etapa; no generación paralela fast |
| `static_review_node` | AI Agent Revisor Estático y presupuesto compartido | Revisión inicial de malla/solver; diez reparaciones compartidas |
| `local_runner_node` | Code de preparación, Execute Command y Code de validación | Restauración de inputs, salida nativa, aplicación resuelta con foamDictionary y campos recientes no comprimidos |
| `mesh_reviewer_node` / `solver_reviewer_node` | Dos AI Agent revisores independientes | Reparaciones por etapa, retorno solver→malla, límites y parada sin progreso |
| `visualization_node` | AI Agent Visualización, renderizado y comprobación PNG | Dos intentos; fallo tras solver produce partial_success |
| RAG FAISS del repositorio | Code de búsqueda léxica y HTTP Request Tool | Adaptado; no carga los índices ni reproduce su ranking semántico |
| `hpc_runner_node`, ESI y traducción legacy | No implementados | Peticiones HPC o ESI se rechazan explícitamente |

## Herramientas HTTP

Los seis nodos `Tutorial_Foundation10_*` realizan GET exclusivamente contra:

`https://raw.githubusercontent.com/OpenFOAM/OpenFOAM-10/master/tutorials/<tutorial_path>`

La ruta relativa es el único argumento que puede proponer el agente. Se rechazan rutas absolutas, segmentos vacíos, `.` y `..`; no puede elegir otro host. Ejemplo verificado: `incompressible/icoFoam/cavity/cavity/system/controlDict`. Se solicita `Range: bytes=0-15999`, que el origen comprobado atiende con HTTP 206; tiempo máximo 20 segundos y sin redirecciones. Se devuelven estado HTTP y texto. Las respuestas parciales son evidencia incompleta; 404, fallo de conexión y timeout deben comunicarse, nunca sustituirse por contenido inventado. No requieren credenciales. No son una herramienta de búsqueda web general.

## Evidencia de validación en esta sesión

- JSON, sintaxis JavaScript, conexiones y Compose comprobados.
- Importación del workflow completo comprobada con el CLI real de n8n **2.46.6** en una instancia local de validación.
- AI Agent, Ollama Chat Model, Simple Memory y Structured Output Parser ejecutados dentro de n8n real durante dos turnos contra un servidor Ollama **simulado**, comprobando que el segundo turno recibe historial.
- Acceso a `fs`, `path` y `crypto` comprobado en el runner JavaScript real de n8n.
- 19 escenarios simulados del workflow completo, incluidos importación ZIP, protección de rutas y symlinks, límites de reparación y comprobaciones de evidencia nativa.
- Endpoint oficial HTTP comprobado con respuesta 206 al rango solicitado.
- **Pendiente:** construcción completa de la imagen ampliada, conexión a tu Windows/Ollama y simulación CFD real. Las pruebas anteriores no prueban exactitud física ni sustituyen esas comprobaciones.

## Entrada, salida y rutas de error

El flujo principal tiene una sola entrada (`Inicio manual`) y una sola salida (`Resultado e historial`). Todos sus nodos son alcanzables desde esa entrada y tienen un camino al informe final, incluidos los bucles de revisión. La nota de arquitectura desconectada se ha eliminado.

Cada Code, AI Agent, IF y Execute Command del flujo principal dispone de una salida de error explícita hacia `Recoger error y preparar informe`. Ese nodo conserva el contexto disponible, identifica el nodo fallido y desemboca directamente en el informe final; no reintenta un escritor de informes que haya fallado. Los fallos de visualización conservan `partial_success` cuando existe éxito previo del solver. Los errores de importación, validación, modelo y ejecución quedan reflejados en `errors` y `termination_reason`.

Los ocho modelos, ocho memorias, ocho parsers y seis HTTP Request Tool son subnodos de n8n: no admiten una entrada `main` y se conectan mediante `ai_languageModel`, `ai_memory`, `ai_outputParser` o `ai_tool`. Por eso la condición de una entrada y una salida se aplica al flujo de ejecución principal, no al grado de todos los subnodos auxiliares. No hay nodos decorativos o componentes desconectados.

Estas rutas no convierten en recuperable una caída del contenedor o una cancelación manual de n8n: esos eventos pueden impedir que se ejecute cualquier nodo final.
