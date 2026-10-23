"""Explainable algorithms; this lightweight engine is not an LLM."""
from __future__ import annotations
import re
from datetime import datetime, timedelta, timezone
from typing import Literal
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=150)
    description: str = Field(default="", max_length=10000)
    priority: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"
    dueDate: str | None = Field(default=None, max_length=50)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        if not value.strip(): raise ValueError("Task title cannot be blank")
        return value.strip()

    @field_validator("dueDate")
    @classmethod
    def valid_due_date(cls, value: str | None) -> str | None:
        return normalize_date(value)

    estimateMinutes: int = Field(default=60, ge=5, le=480)

class Task(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(max_length=150)
    description: str | None = Field(default=None, max_length=10000)
    priority: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"
    dueDate: str | None = Field(default=None, max_length=50)
    completedAt: str | None = Field(default=None, max_length=50)

    @field_validator("dueDate", "completedAt")
    @classmethod
    def valid_date(cls, value: str | None) -> str | None:
        return normalize_date(value)
    estimateMinutes: int = Field(default=60, ge=5, le=480)
    dependsOn: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("dependsOn")
    @classmethod
    def bounded_ids(cls, values: list[str]) -> list[str]:
        if any(not value or len(value) > 100 for value in values): raise ValueError("Dependency IDs must be 1–100 characters")
        return list(dict.fromkeys(values))

class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(default="", max_length=4000)
    tasks: list[Task] = Field(default_factory=list, max_length=1000)
    kind: Literal["interpret", "plan", "summary", "search", "analyze", "qa", "documentation", "research", "automation"] = "interpret"
    capacityMinutes: int = Field(default=360, ge=30, le=720)

def normalize_date(value: str | None) -> str | None:
    if value is None: return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None: parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


CATEGORIES = {"engineering": r"\b(bug|fix|api|code|test|deploy|login)\b", "design": r"\b(design|ui|logo|mockup)\b", "research": r"\b(research|investigate|compare|explore)\b", "documentation": r"\b(doc|document|readme|write)\b"}

def parse_date(text: str, now: datetime) -> str | None:
    date = re.search(r"\b\d{4}-\d{2}-\d{2}\b", text)
    if date:
        try: return datetime.fromisoformat(date[0]).replace(hour=17, tzinfo=timezone.utc).isoformat()
        except ValueError: return None
    days = 1 if re.search(r"\btomorrow\b", text, re.I) else 0 if re.search(r"\btoday\b", text, re.I) else None
    in_days = re.search(r"\bin (\d{1,3}) days?\b", text, re.I)
    if in_days: days = min(int(in_days[1]), 365)
    for index, name in enumerate(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]):
        if re.search(rf"\b{name}\b", text, re.I): days = (index - now.weekday()) % 7 or 7
    return (now + timedelta(days=days)).replace(hour=17, minute=0, second=0, microsecond=0).isoformat() if days is not None else None

def interpret(text: str, now: datetime) -> dict:
    category = next((name for name, pattern in CATEGORIES.items() if re.search(pattern, text, re.I)), "general")
    urgent = bool(re.search(r"\b(urgent|asap|critical|high priority|production|outage)\b", text, re.I))
    priority = "HIGH" if urgent else "LOW" if re.search(r"\b(low priority|someday|optional)\b", text, re.I) else "MEDIUM"
    title = re.sub(r"^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?task\s*(?:(?:called|named|to)\s+)?", "", text, flags=re.I).strip(' ."')
    title = re.sub(r"\s+(?:by|due)\s+(?:today|tomorrow|\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*", "", title, flags=re.I)
    due = parse_date(text, now)
    draft = Draft(title=(title or "Untitled task")[:150], priority=priority, dueDate=due)
    return {"drafts": [draft.model_dump()], "category": category, "explanations": [f"Classified as {category} using explicit keywords.", "Urgency keyword raises priority to HIGH." if urgent else "No urgency keyword found; priority uses the explicit request or MEDIUM.", f"Deadline interpreted in UTC: {due}." if due else "No supported deadline expression found; review and set one if needed."], "message": "I've prepared your task. Review it before creating it."}

def analyze(data: Input, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    base = {"mode": "lightweight", "engine": "Deterministic Python + TF-IDF", "disclaimer": "Rule-based assistance, not LLM reasoning. All changes require review."}
    if data.kind == "interpret":
        if not data.text.strip():
            return {**base, "drafts": [], "message": "Tell me what you would like to create.", "explanations": []}
        if re.fullmatch(r"(?:hello|hi|hey)(?:\s+sammtech)?[.! ]*", data.text, re.I):
            return {**base, "drafts": [], "message": "Hello! What would you like to work on?", "explanations": []}
        return {**base, **interpret(data.text, now)}
    active = [t for t in data.tasks if not t.completedAt]
    ids = {t.id: t for t in data.tasks}
    def deadline(t):
        try:
            date = datetime.fromisoformat(t.dueDate.replace("Z", "+00:00")) if t.dueDate else None
            return date.replace(tzinfo=timezone.utc) if date and date.tzinfo is None else date
        except ValueError: return None
    def score(t):
        due = deadline(t)
        return {"HIGH": 60, "MEDIUM": 30, "LOW": 10}[t.priority] + (40 if due and due < now else 25 if due and due < now + timedelta(days=3) else 0)
    ranked = sorted(active, key=lambda t: (-score(t), t.id))
    overdue = [t.id for t in active if deadline(t) and deadline(t) < now]
    blockers = [{"taskId": t.id, "blockedBy": [d for d in t.dependsOn if d not in ids or not ids[d].completedAt]} for t in active]
    blockers = [b for b in blockers if b["blockedBy"]]
    recommendations = [{"taskId": t.id, "priority": "HIGH" if score(t) >= 60 else t.priority, "score": score(t), "reason": "Existing priority plus deadline urgency; blocked tasks need prerequisites first."} for t in ranked[:20]]
    completion = len(data.tasks) - len(active)
    result = {**base, "summary": f"{completion} of {len(data.tasks)} tasks complete. {len(active)} open, {len(overdue)} overdue, {len(blockers)} blocked.", "overdue": overdue, "blockers": blockers, "recommendations": recommendations, "workloadMinutes": int(np.sum([t.estimateMinutes for t in active])), "explanations": ["Workload sums user-editable estimates; no hidden productivity score.", "Completed tasks are excluded from planning."]}
    if data.kind == "plan":
        days = [{"date": (now + timedelta(days=i)).date().isoformat(), "tasks": [], "minutes": 0} for i in range(7)]
        scheduled: dict[str, int] = {}
        remaining = list(ranked)
        for day_index, day in enumerate(days):
            if datetime.fromisoformat(day["date"]).weekday() >= 5: continue
            for t in list(remaining):
                ready = all(d in ids and (ids[d].completedAt or (d in scheduled and scheduled[d] < day_index)) for d in t.dependsOn)
                if ready and day["minutes"] + t.estimateMinutes <= data.capacityMinutes:
                    day["tasks"].append(t.id); day["minutes"] += t.estimateMinutes; scheduled[t.id] = day_index; remaining.remove(t)
        result.update(plan=days, unscheduled=[t.id for t in remaining], explanations=result["explanations"] + ["Weekdays only; dependencies are scheduled on earlier days; capacity is a daily maximum.", "Missing or archived prerequisites remain blocked and unscheduled until their dependency is resolved."])
        if data.text and not data.tasks:
            result["drafts"] = [Draft(title=f"{step}: {data.text}"[:150], description=detail).model_dump() for step, detail in [("Define scope", "Agree on users, requirements and acceptance criteria."), ("Design", "Draft the workflow and technical design."), ("Build", "Implement the smallest working increment."), ("Validate", "Test authorization, behavior and accessibility."), ("Launch", "Document setup, release and monitor.")]]
    if data.kind in ("search", "research"):
        result["matches"] = search(data.text, data.tasks)
        result["explanations"].append("Search is over authorized project data only; no web research was performed.")
    if data.kind == "qa":
        result["checks"] = [{"taskId": t.id, "checks": ["Acceptance criteria documented", "Failure path tested", "Authorization verified", "Keyboard accessible"]} for t in ranked[:10]]
    if data.kind == "documentation":
        result["document"] = "# Project status\n\n" + result["summary"] + "\n\n" + "\n".join(f"- [{'x' if t.completedAt else ' '}] {t.title}" for t in data.tasks)
    candidates = []
    titles = [(other.id, other.title.strip().lower()) for other in active if other.title.strip()]
    for t in active:
        description = (t.description or "").lower()
        reference = re.search(r"\b(after|depends on|blocked by)\s+", description)
        if not reference: continue
        prerequisite_text = description[reference.end():reference.end() + 2000]
        for other_id, title in titles:
            if t.id != other_id and title in prerequisite_text and other_id not in t.dependsOn:
                candidates.append({"taskId": t.id, "dependsOnId": other_id, "reason": "Description names a possible prerequisite after an explicit dependency phrase; confirmation required."})
                if len(candidates) >= 30: break
        if len(candidates) >= 30: break
    result["suggestedDependencies"] = candidates
    return result

def search(query: str, tasks: list[Task]) -> list[dict]:
    if not query.strip() or not tasks: return []
    texts = [f"{t.title} {(t.description or '')[:4000]}" for t in tasks]
    try:
        matrix = TfidfVectorizer(stop_words="english", max_features=20000, dtype=np.float32).fit_transform([query] + texts)
        scores = cosine_similarity(matrix[:1], matrix[1:])[0]
    except ValueError: return []
    return [{"taskId": tasks[i].id, "score": round(float(scores[i]), 4), "method": "lexical TF-IDF"} for i in np.argsort(-scores)[:10] if scores[i] > 0]
