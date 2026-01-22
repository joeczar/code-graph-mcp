#!/usr/bin/env ruby
# frozen_string_literal: true

require 'json'
require 'bundler'
require 'prism'
require 'ruby_indexer/ruby_indexer'

# Ruby LSP Indexer Script
#
# Uses RubyIndexer::Index to extract entities and relationships from Ruby files.
# Outputs JSON to stdout for consumption by the MCP server.
#
# Usage:
#   ruby scripts/ruby-indexer.rb <file_path> [<file_path> ...]
#
# Output format:
#   {
#     "entities": [
#       {
#         "type": "class" | "module" | "method",
#         "name": "FullyQualifiedName",
#         "filePath": "/absolute/path/to/file.rb",
#         "startLine": 1,
#         "endLine": 10,
#         "language": "ruby",
#         "metadata": { ... }
#       }
#     ],
#     "relationships": [
#       {
#         "type": "extends" | "implements" | "calls",
#         "sourceName": "SourceEntity",
#         "targetName": "TargetEntity",
#         "metadata": { ... }
#       }
#     ]
#   }

def extract_entities_and_relationships(index, file_paths)
  entities = []
  relationships = []

  file_paths.each do |file_path|
    abs_path = File.expand_path(file_path)

    unless File.exist?(abs_path)
      warn "File not found: #{abs_path}"
      next
    end

    # Index the file using new API (ruby-lsp >= 0.20)
    source = File.read(abs_path)
    uri = URI::Generic.build(scheme: 'file', path: abs_path)
    index.index_single(uri, source)
  end

  # Extract entities from index using names iterator
  index.names.each do |name|
    entries = index[name]
    next unless entries

    entries.each do |entry|
      entity = entry_to_entity(entry)
      entities << entity if entity
    end
  end

  # Extract relationships from index
  index.names.each do |name|
    entries = index[name]
    next unless entries

    entries.each do |entry|
      rels = entry_to_relationships(entry, index)
      relationships.concat(rels)
    end
  end

  {
    entities: entities,
    relationships: relationships
  }
end

def entry_to_entity(entry)
  location = entry.location
  file_path = entry.file_path

  case entry
  when RubyIndexer::Entry::Class
    {
      type: 'class',
      name: entry.name,
      filePath: file_path,
      startLine: location.start_line,
      endLine: location.end_line,
      language: 'ruby',
      metadata: {
        nesting: entry.nesting.join('::')
      }
    }
  when RubyIndexer::Entry::Module
    {
      type: 'module',
      name: entry.name,
      filePath: file_path,
      startLine: location.start_line,
      endLine: location.end_line,
      language: 'ruby',
      metadata: {
        nesting: entry.nesting.join('::')
      }
    }
  when RubyIndexer::Entry::Method
    {
      type: 'method',
      name: entry.name,
      filePath: file_path,
      startLine: location.start_line,
      endLine: location.end_line,
      language: 'ruby',
      metadata: {
        owner: entry.owner&.name,
        visibility: entry.visibility.to_s,
        signatures: entry.signatures.map { |sig| signature_to_hash(sig) }
      }
    }
  else
    nil # Ignore other entry types for now
  end
end

def signature_to_hash(signature)
  {
    parameters: signature.parameters.map { |param| param_to_hash(param) }
  }
end

def param_to_hash(param)
  case param
  when RubyIndexer::Entry::RequiredParameter
    { name: param.name, kind: 'required' }
  when RubyIndexer::Entry::OptionalParameter
    { name: param.name, kind: 'optional' }
  when RubyIndexer::Entry::RestParameter
    { name: param.name, kind: 'rest' }
  when RubyIndexer::Entry::KeywordParameter
    { name: param.name, kind: 'keyword' }
  when RubyIndexer::Entry::KeywordRestParameter
    { name: param.name, kind: 'keyword_rest' }
  when RubyIndexer::Entry::BlockParameter
    { name: param.name, kind: 'block' }
  else
    { name: param.to_s, kind: 'unknown' }
  end
end

def entry_to_relationships(entry, index)
  relationships = []

  case entry
  when RubyIndexer::Entry::Class
    # Extract inheritance relationships using linearized_ancestors_of
    begin
      ancestors = index.linearized_ancestors_of(entry.name)
    rescue RubyIndexer::Index::NonExistingNamespaceError
      # Class inherits from something not in the index
      ancestors = nil
    end

    if ancestors && ancestors.length > 1
      # First ancestor after self is the direct parent
      parent_name = ancestors[1]

      if parent_name && parent_name != 'Object' && parent_name != 'BasicObject'
        parent_entries = index[parent_name]
        parent_file_path = parent_entries&.first&.file_path

        rel = {
          type: 'extends',
          sourceName: entry.name,
          targetName: parent_name,
          metadata: {
            kind: 'inheritance'
          }
        }
        rel[:targetFilePath] = parent_file_path if parent_file_path && parent_file_path != entry.file_path
        relationships << rel
      end

      # Remaining ancestors (excluding Object/BasicObject) are included modules
      ancestors[2..].each do |ancestor_name|
        next if ancestor_name == 'Object' || ancestor_name == 'BasicObject'

        # Check if this is a module by looking it up in the index
        ancestor_entries = index[ancestor_name]
        is_module = ancestor_entries&.any? { |e| e.is_a?(RubyIndexer::Entry::Module) }

        if is_module
          module_file_path = ancestor_entries&.first&.file_path

          rel = {
            type: 'implements',
            sourceName: entry.name,
            targetName: ancestor_name,
            metadata: {
              kind: 'module_inclusion'
            }
          }
          rel[:targetFilePath] = module_file_path if module_file_path && module_file_path != entry.file_path
          relationships << rel
        end
      end
    end
  when RubyIndexer::Entry::Module
    # Modules can also include other modules
    begin
      ancestors = index.linearized_ancestors_of(entry.name)
    rescue RubyIndexer::Index::NonExistingNamespaceError
      ancestors = nil
    end

    if ancestors && ancestors.length > 1
      # Skip first element (self) and process included modules
      ancestors[1..].each do |ancestor_name|
        next if ancestor_name == 'Object' || ancestor_name == 'BasicObject'

        ancestor_entries = index[ancestor_name]
        ancestor_file_path = ancestor_entries&.first&.file_path

        rel = {
          type: 'implements',
          sourceName: entry.name,
          targetName: ancestor_name,
          metadata: {
            kind: 'module_inclusion'
          }
        }
        rel[:targetFilePath] = ancestor_file_path if ancestor_file_path && ancestor_file_path != entry.file_path
        relationships << rel
      end
    end
  end

  relationships
end

# Main execution
if __FILE__ == $PROGRAM_NAME
  # Handle --check flag for availability testing
  if ARGV.first == '--check'
    begin
      # Just verify we can load the gem and create an index
      index = RubyIndexer::Index.new
      puts JSON.generate({ available: true })
      exit 0
    rescue LoadError => e
      warn "Error: ruby-lsp gem not installed. Run: gem install ruby-lsp"
      warn "Details: #{e.message}"
      exit 2
    rescue => e
      warn "Error initializing index: #{e.message}"
      exit 3
    end
  end

  if ARGV.empty?
    warn "Usage: #{$PROGRAM_NAME} <file_path> [<file_path> ...]"
    warn "       #{$PROGRAM_NAME} --check  # Check if ruby-lsp is available"
    exit 1
  end

  begin
    index = RubyIndexer::Index.new
    result = extract_entities_and_relationships(index, ARGV)
    puts JSON.generate(result)
  rescue LoadError => e
    warn "Error: ruby-lsp gem not installed. Run: gem install ruby-lsp"
    warn "Details: #{e.message}"
    exit 2
  rescue => e
    warn "Error indexing files: #{e.message}"
    warn e.backtrace.join("\n")
    exit 3
  end
end
