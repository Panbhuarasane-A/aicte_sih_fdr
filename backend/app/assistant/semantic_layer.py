"""The allowlisted semantic contract used by assistant planners.

This module deliberately contains names and metadata only. It never contains
database rows or document contents.
"""

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


@dataclass(frozen=True)
class FieldDefinition:
    label: str
    value_type: str
    synonyms: tuple[str, ...] = ()
    filterable: bool = True
    groupable: bool = False
    sortable: bool = False
    sensitive: bool = False


@dataclass(frozen=True)
class EntityDefinition:
    label: str
    fields: dict[str, FieldDefinition]
    permission: str


SEMANTIC_LAYER: dict[str, EntityDefinition] = {
    "institutions": EntityDefinition(
        label="Institutions",
        permission="assistant.institutions.read",
        fields={
            "id": FieldDefinition("Institution ID", "string", sensitive=True),
            "name": FieldDefinition("Institution name", "string", ("college",), True, True, True),
            "aicte_id": FieldDefinition("AICTE ID", "string", sensitive=True),
            "state": FieldDefinition("State", "string", (), True, True, True),
            "district": FieldDefinition("District or city", "string", ("city",), True, True, True),
            "region": FieldDefinition("Region", "string", (), True, True, True),
            "type": FieldDefinition("Institution type", "string", (), True, True, True),
        },
    ),
    "deposits": EntityDefinition(
        label="Deposits",
        permission="assistant.deposits.read",
        fields={
            "institution_id": FieldDefinition("Institution", "string", sensitive=True),
            "amount": FieldDefinition("Amount", "number", (), True, False, True),
            "date": FieldDefinition("Deposit date", "date", (), True, False, True),
            "status": FieldDefinition("Deposit status", "string", (), True, True, True),
        },
    ),
    "claims": EntityDefinition(
        label="Payment claims",
        permission="assistant.claims.read",
        fields={
            "institution_id": FieldDefinition("Institution", "string", sensitive=True),
            "amount": FieldDefinition("Amount", "number", (), True, False, True),
            "date": FieldDefinition("Claim date", "date", (), True, False, True),
            "match_result": FieldDefinition("Match result", "string", (), True, True, True),
            "status": FieldDefinition("Claim status", "string", (), True, True, True),
        },
    ),
    "fdrs": EntityDefinition(
        label="FDRs",
        permission="assistant.fdrs.read",
        fields={
            "institution_id": FieldDefinition("Institution", "string", sensitive=True),
            "number": FieldDefinition("FDR number", "string", sensitive=True),
            "amount": FieldDefinition("Amount", "number", (), True, False, True),
            "issue_date": FieldDefinition("Issue date", "date", (), True, False, True),
            "maturity_date": FieldDefinition("Maturity date", "date", (), True, False, True),
            "status": FieldDefinition("FDR status", "string", (), True, True, True),
            "bank": FieldDefinition("Bank", "string", (), True, True, True),
        },
    ),
    "documents": EntityDefinition(
        label="Documents",
        permission="assistant.documents.read",
        fields={
            "institution_id": FieldDefinition("Institution", "string", sensitive=True),
            "type": FieldDefinition("Document type", "string", (), True, True, True),
            "gate_state": FieldDefinition("Processing state", "string", (), True, True, True),
            "check_result": FieldDefinition("Check result", "string", (), True, True, True),
            "flags_count": FieldDefinition("Issues", "number", (), True, False, True),
        },
    ),
    "cases": EntityDefinition(
        label="Cases",
        permission="assistant.cases.read",
        fields={
            "type": FieldDefinition("Case type", "string", (), True, True, True),
            "severity": FieldDefinition("Severity", "string", (), True, True, True),
            "status": FieldDefinition("Case status", "string", (), True, True, True),
            "discrepancy_type": FieldDefinition("Discrepancy type", "string", (), True, True, True),
        },
    ),
    "release_requests": EntityDefinition(
        label="Release requests",
        permission="assistant.release_requests.read",
        fields={
            "institution_id": FieldDefinition("Institution", "string", sensitive=True),
            "status": FieldDefinition("Request status", "string", (), True, True, True),
            "missing_docs": FieldDefinition("Missing documents", "string", (), True, True, False),
        },
    ),
    "renewals": EntityDefinition(
        label="Renewals",
        permission="assistant.renewals.read",
        fields={
            "institution_id": FieldDefinition("Institution", "string", sensitive=True),
            "status": FieldDefinition("Renewal status", "string", (), True, True, True),
            "date": FieldDefinition("Renewal date", "date", (), True, False, True),
        },
    ),
}


class FilterSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str
    op: Literal["eq", "neq", "in", "not_in", "contains", "gte", "lte", "between"]
    value: Any


class AggregationSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fn: Literal["count", "sum", "avg", "min", "max"]
    field: str | None = None
    as_: str = Field(alias="as")


class SortSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str
    direction: Literal["asc", "desc"] = "asc"


class QuerySpec(BaseModel):
    """Validated planner output; scope filters are injected separately."""

    model_config = ConfigDict(extra="forbid")

    entity: str
    select: list[str] = Field(default_factory=list, max_length=20)
    filters: list[FilterSpec] = Field(default_factory=list, max_length=20)
    group_by: list[str] = Field(default_factory=list, max_length=5)
    aggregations: list[AggregationSpec] = Field(default_factory=list, max_length=10)
    sort: list[SortSpec] = Field(default_factory=list, max_length=5)
    limit: int = Field(default=100, ge=1, le=5000)
    chart_hint: Literal["bar", "donut", "line", "grouped_bar"] | None = None

    @field_validator("entity")
    @classmethod
    def validate_entity(cls, value: str) -> str:
        if value not in SEMANTIC_LAYER:
            raise ValueError("Entity is not available to the assistant")
        return value

    def validate_fields(self) -> "QuerySpec":
        definition = SEMANTIC_LAYER[self.entity]
        requested = [*self.select, *self.group_by, *(item.field for item in self.filters), *(item.field for item in self.sort)]
        requested.extend(item.field for item in self.aggregations if item.field)
        unknown = sorted({field for field in requested if field not in definition.fields})
        if unknown:
            raise ValueError(f"Unknown field(s) for {self.entity}: {', '.join(unknown)}")
        for field in self.select:
            if not definition.fields[field].filterable:
                raise ValueError(f"Field cannot be selected: {field}")
        for field in self.group_by:
            if not definition.fields[field].groupable:
                raise ValueError(f"Field cannot be grouped: {field}")
        for item in self.sort:
            if not definition.fields[item.field].sortable:
                raise ValueError(f"Field cannot be sorted: {item.field}")
        return self


def semantic_schema() -> dict[str, Any]:
    """Return planner-safe metadata without values from the database."""
    return {
        entity: {
            "label": definition.label,
            "permission": definition.permission,
            "fields": {
                name: {
                    "label": field.label,
                    "type": field.value_type,
                    "synonyms": list(field.synonyms),
                    "sensitive": field.sensitive,
                }
                for name, field in definition.fields.items()
            },
        }
        for entity, definition in SEMANTIC_LAYER.items()
    }
