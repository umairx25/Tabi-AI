# """
# schemas.py
# Contains a list of pydantic schemas that represent different browser related
# objects, helping ensure proper LLM structure
# """

from pydantic import BaseModel, Field
from typing import List, Union, Optional


class Tab(BaseModel):
    """A representation of a single tab"""
    title: str = Field(..., description="The tab's title")
    url: str = Field(..., description="The tab's url")
    description: str = Field(..., description="The tab's description")

class TabList(BaseModel):
    """A list of tabs that belong together without grouping metadata."""
    tabs: List[Tab] = Field(..., description="A list of tabs")

class TabGroup(BaseModel):
    """A group of tabs along with an identifying group name"""
    group_name: str = Field(..., description="The name of the tab group")
    tabs: List[Tab] = Field(..., description="A list of tabs in this group")

class TabGroupList(BaseModel):
    """A list of tab groups"""
    tabs: List[TabGroup] = Field(..., description="A list of tab groups")


class Bookmark(BaseModel):
    id: str = Field(..., description="The bookmark's unique Chrome ID")
    title: str
    url: Optional[str] = None

class BookmarkTree(BaseModel):
    bookmarks: List[Bookmark] = Field(..., description="Flat list of all bookmarks")

# Define all possible output types
class SearchResult(BaseModel):
    action: str = Field(default="search_tabs")
    output: Tab  # Single tab that matches
    confidence: float 

class CloseResult(BaseModel):
    action: str = Field(default="close_tabs")
    output: TabList  # Multiple tabs to close
    confidence: float

class OrganizeResult(BaseModel):
    action: str = Field(default="organize_tabs")
    output: TabGroupList  # Organized groups
    confidence: float

class GenerateResult(BaseModel):
    action: str = Field(default="generate_tabs")
    output: TabGroup  # Organized groups
    confidence: float

# Bookmark results

class RemoveBookmarkResult(BaseModel):
    action: str = Field(default="remove_bookmarks")
    output: BookmarkTree
    confidence: float

class SearchBookmarkResult(BaseModel):
    action: str = Field(default="search_bookmarks")
    output: BookmarkTree
    confidence: float

class BookmarkMove(BaseModel):
    id: str = Field(..., description="The bookmark's unique Chrome ID")
    move_to_folder: str = Field(..., description="The title of the folder to move this bookmark into")


class TabToAdd(BaseModel):
    tab_title: str = Field(..., description="Title of the tab to add as a bookmark")
    tab_url: str = Field(..., description="URL of the tab to add as a bookmark")
    folder_title: str = Field(..., description="Target folder title where this tab should be bookmarked")


class OrganizeBookmarkOutput(BaseModel):
    reorganized_bookmarks: List[BookmarkMove] = Field(
        default_factory=list,
        description="List of existing bookmarks to move into specific folders"
    )
    tabs_to_add: List[TabToAdd] = Field(
        default_factory=list,
        description="Tabs that should be added as bookmarks under specific folders"
    )


class OrganizeBookmarkResult(BaseModel):
    action: str = Field(default="organize_bookmarks", description="The action type")
    output: OrganizeBookmarkOutput = Field(..., description="The reorganization plan and any tabs to add")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Model confidence score between 0 and 1")


# Unified type union (for structured LLM outputs)
Result = Union[
    SearchResult,
    CloseResult,
    OrganizeResult,
    GenerateResult,
    RemoveBookmarkResult,
    SearchBookmarkResult,
    OrganizeBookmarkResult,
]