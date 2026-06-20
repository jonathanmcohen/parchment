CREATE TABLE "doc_links" (
	"source_doc_id" uuid NOT NULL,
	"target_doc_id" uuid NOT NULL,
	CONSTRAINT "doc_links_source_doc_id_target_doc_id_pk" PRIMARY KEY("source_doc_id","target_doc_id")
);
--> statement-breakpoint
ALTER TABLE "doc_links" ADD CONSTRAINT "doc_links_source_doc_id_documents_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_links" ADD CONSTRAINT "doc_links_target_doc_id_documents_id_fk" FOREIGN KEY ("target_doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_links_target_idx" ON "doc_links" USING btree ("target_doc_id");