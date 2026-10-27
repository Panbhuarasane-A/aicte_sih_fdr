import pytest
from pydantic import ValidationError

from app.assistant.semantic_layer import QuerySpec, semantic_schema


def test_schema_contains_metadata_only():
    schema = semantic_schema()
    assert "fdrs" in schema
    assert schema["fdrs"]["fields"]["amount"]["type"] == "number"
    assert "rows" not in str(schema)


def test_unknown_entities_and_fields_are_rejected():
    with pytest.raises(ValidationError):
        QuerySpec(entity="users")

    query = QuerySpec(
        entity="fdrs",
        select=["reference"],
    )
    with pytest.raises(ValueError, match="Unknown field"):
        query.validate_fields()


def test_grouping_and_sorting_require_allowlisted_capabilities():
    grouped = QuerySpec(entity="fdrs", group_by=["amount"])
    with pytest.raises(ValueError, match="cannot be grouped"):
        grouped.validate_fields()

    sortable = QuerySpec(entity="fdrs", sort=[{"field": "bank", "direction": "asc"}])
    assert sortable.validate_fields() is sortable


def test_query_limits_are_clamped_by_validation():
    with pytest.raises(ValidationError):
        QuerySpec(entity="claims", limit=5001)
