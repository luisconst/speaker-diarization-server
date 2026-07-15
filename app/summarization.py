"""AI Summarization engine using local Ollama LLM"""
import httpx
import json
import logging

logger = logging.getLogger(__name__)

# Default prompts per category
DEFAULT_PROMPTS = {
    "reuniao": """Você é um assistente especializado em atas de reuniões corporativas.
Analise a transcrição abaixo e gere o resultado no seguinte formato markdown:

## Resumo
(Resumo executivo de 3-5 parágrafos da reunião)

## Ações
(Lista de ações e tarefas identificadas, com responsáveis quando mencionados, no formato: - [ ] Ação @Responsável)

## Ata
(Ata detalhada cronológica da reunião com os principais pontos discutidos)

---
TRANSCRIÇÃO:
{transcript}""",

    "aula": """Você é um assistente especializado em notas de estudo acadêmicas e de cursos.
Analise a transcrição da aula abaixo e gere o resultado no seguinte formato markdown:

## Resumo
(Resumo da aula em 3-5 parágrafos, destacando os conceitos principais)

## Notas
(Notas e pontos de estudo detalhados organizados por tópico, com explicações e exemplos da aula)

---
TRANSCRIÇÃO:
{transcript}""",

    "entrevista": """Você é um assistente especializado em análise de entrevistas.
Analise a transcrição abaixo e gere o resultado no seguinte formato markdown:

## Resumo
(Resumo geral da entrevista)

## Perguntas e Respostas
(Lista organizada das perguntas feitas e respostas dadas)

## Pontos-Chave
(Principais insights e informações relevantes extraídos)

---
TRANSCRIÇÃO:
{transcript}""",

    "default": """Você é um assistente especializado em análise de áudios transcritos.
Analise a transcrição abaixo e gere o resultado no seguinte formato markdown:

## Resumo
(Resumo geral do conteúdo em 3-5 parágrafos)

## Pontos Principais
(Lista dos pontos mais importantes discutidos)

## Ações Identificadas
(Lista de ações ou próximos passos mencionados, no formato: - [ ] Ação)

---
TRANSCRIÇÃO:
{transcript}"""
}


class SummarizationEngine:
    """Handles AI summarization via local Ollama instance"""
    
    def __init__(self, ollama_url: str = "http://localhost:11434", model: str = "llama3"):
        self.ollama_url = ollama_url.rstrip('/')
        self.model = model
    
    async def is_available(self) -> bool:
        """Check if Ollama is running and accessible"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.ollama_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False
    
    async def list_models(self) -> list:
        """List available models in Ollama"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.ollama_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception:
            pass
        return []
    
    def build_transcript_text(self, segments) -> str:
        """Convert conversation segments to readable transcript text"""
        lines = []
        current_speaker = None
        for seg in segments:
            speaker = seg.speaker_name or "Desconhecido"
            mins = int(seg.start_offset // 60)
            secs = int(seg.start_offset % 60)
            time_str = f"[{mins:02d}:{secs:02d}]"
            
            if speaker != current_speaker:
                lines.append(f"\n{speaker} {time_str}:")
                current_speaker = speaker
            lines.append(f"  {seg.text}")
        
        return "\n".join(lines)
    
    def get_prompt(self, category: str, custom_prompts: dict = None) -> str:
        """Get the prompt template for a given category"""
        prompts = custom_prompts or DEFAULT_PROMPTS
        return prompts.get(category, prompts.get("default", DEFAULT_PROMPTS["default"]))
    
    async def summarize(self, transcript_text: str, category: str = "default", 
                        custom_prompt: str = None, custom_prompts: dict = None) -> dict:
        """Generate AI summary using Ollama"""
        if custom_prompt:
            prompt = custom_prompt.replace("{transcript}", transcript_text)
        else:
            template = self.get_prompt(category, custom_prompts)
            prompt = template.replace("{transcript}", transcript_text)
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.3,
                            "num_ctx": 8192
                        }
                    }
                )
                
                if resp.status_code == 200:
                    data = resp.json()
                    response_text = data.get("response", "")
                    
                    # Try to extract action items from the response
                    action_items = []
                    for line in response_text.split("\n"):
                        stripped = line.strip()
                        if stripped.startswith("- [ ]") or stripped.startswith("- [x]"):
                            action_items.append(stripped.replace("- [ ]", "").replace("- [x]", "").strip())
                    
                    return {
                        "summary_markdown": response_text,
                        "action_items": action_items,
                        "model": self.model,
                        "success": True
                    }
                else:
                    logger.error(f"Ollama returned status {resp.status_code}: {resp.text}")
                    return {"success": False, "error": f"Ollama error: {resp.status_code}"}
        except httpx.TimeoutException:
            return {"success": False, "error": "Ollama request timed out (5 min limit)"}
        except Exception as e:
            logger.error(f"Summarization failed: {e}")
            return {"success": False, "error": str(e)}
